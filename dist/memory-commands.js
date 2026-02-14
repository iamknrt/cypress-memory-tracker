// cypress/support/memory-commands.js

let memoryInterval = null;
let isTracking = false;

/**
 * Начинает отслеживание памяти для текущего теста
 * @param {Object} options - Опции конфигурации
 * @param {number} options.interval - Интервал измерений в мс (по умолчанию 500)
 * @param {string} options.testTitle - Название теста (автоматически определяется)
 */
Cypress.Commands.add('startMemoryTracking', (options = {}) => {
    // Проверяем, включено ли отслеживание памяти
    const memoryConfig = Cypress.expose('memoryTracking') || {};
    const enableMemoryTracking = memoryConfig.enabled;
    if (!enableMemoryTracking) {
        return;
    }

    const interval = options.interval || 500;
    const specRelativePath = Cypress.spec.relative.replace(/\\/g, '/');
    const specName = Cypress.spec.name;
    const testTitle = options.testTitle || Cypress.currentTest?.title || 'Unknown Test';

    // Останавливаем предыдущее отслеживание, если оно было
    if (memoryInterval) {
        clearInterval(memoryInterval);
        memoryInterval = null;
    }

    cy.window().then((win) => {
        if (!win.performance || !win.performance.memory) {
            cy.log('⚠️ Performance.memory API не доступно');
            return;
        }

        isTracking = true;

        // Записываем начальное состояние памяти
        const initialMemory = {
            usedJSHeapSize: win.performance.memory.usedJSHeapSize,
            totalJSHeapSize: win.performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: win.performance.memory.jsHeapSizeLimit,
        };

        // Используем cy.task вне setInterval
        cy.task(
            'recordMemory',
            {
                type: 'test_start',
                specPath: specRelativePath, // Оставляем для возможной отладки
                specName: specName,         // Передаем имя файла
                testTitle,
                memory: initialMemory,
            },
            { log: false }
        );

        // ИСПРАВЛЕНИЕ: Выносим setInterval в обычный JavaScript без cy команд
        memoryInterval = setInterval(() => {
            if (!isTracking || !win.performance || !win.performance.memory) {
                return;
            }

            const currentMemory = {
                usedJSHeapSize: win.performance.memory.usedJSHeapSize,
                totalJSHeapSize: win.performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: win.performance.memory.jsHeapSizeLimit,
                timestamp: Date.now(),
            };

            // Сохраняем данные в window объект вместо немедленного вызова cy.task
            if (!win.cypressMemoryBuffer) {
                win.cypressMemoryBuffer = [];
            }

            win.cypressMemoryBuffer.push({
                type: 'test_sample',
                specPath: specRelativePath,
                specName: specName,         // Добавить в буфер
                testTitle,
                memory: currentMemory,
            });
        }, interval);
    });
});

/**
 * Останавливает отслеживание памяти для текущего теста
 */
Cypress.Commands.add('stopMemoryTracking', () => {
    const memoryConfig = Cypress.expose('memoryTracking') || {};
    const enableMemoryTracking = memoryConfig.enabled;
    if (!enableMemoryTracking || !isTracking) {
        return;
    }

    cy.window().then((win) => {
        // Останавливаем интервал
        if (memoryInterval) {
            clearInterval(memoryInterval);
            memoryInterval = null;
        }

        isTracking = false;

        // Записываем финальное состояние памяти
        if (win.performance && win.performance.memory) {
            const finalMemory = {
                usedJSHeapSize: win.performance.memory.usedJSHeapSize,
                totalJSHeapSize: win.performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: win.performance.memory.jsHeapSizeLimit,
                timestamp: Date.now(),
            };

            // const specPath = Cypress.spec.relative;
            const specRelativePath = Cypress.spec.relative.replace(/\\/g, '/');
            const specName = Cypress.spec.name;
            const testTitle = Cypress.currentTest?.title || 'Unknown Test';

            // Сначала отправляем все буферизованные данные
            if (win.cypressMemoryBuffer && win.cypressMemoryBuffer.length > 0) {
                // Разбиваем на батчи для больших объемов данных
                const batchSize = 50;
                const batches = [];

                for (let i = 0; i < win.cypressMemoryBuffer.length; i += batchSize) {
                    batches.push(win.cypressMemoryBuffer.slice(i, i + batchSize));
                }

                // Отправляем батчи последовательно
                batches.forEach((batch, index) => {
                    cy.task(
                        'recordMemoryBatch',
                        {
                            batch,
                            batchIndex: index,
                            totalBatches: batches.length,
                        },
                        { log: false }
                    );
                });

                // Очищаем буфер
                win.cypressMemoryBuffer = [];
            }

            // Записываем финальное состояние
            cy.task(
                'recordMemory',
                {
                    type: 'test_end',
                    specPath: specRelativePath,
                    specName: specName,       // Передать имя файла
                    testTitle,
                    memory: finalMemory,
                },
                { log: false }
            );
        }
    });
});

/**
 * Измеряет память во время выполнения определенного действия
 * @param {Function} actionFn - Функция с действиями для измерения
 * @param {Object} options - Опции конфигурации
 */
Cypress.Commands.add('measureMemoryDuring', (actionFn, options = {}) => {
    const memoryConfig = Cypress.expose('memoryTracking') || {};
    const enableMemoryTracking = memoryConfig.enabled;
    if (!enableMemoryTracking) {
        if (actionFn) actionFn();
        return;
    }

    cy.startMemoryTracking(options);

    if (actionFn) {
        actionFn();
    }

    // Небольшая пауза для стабилизации измерений
    cy.wait(options.stabilizationDelay || 1000);
    cy.stopMemoryTracking();
});

// Автоматическое отслеживание памяти для каждого теста (если включено)
beforeEach(function () {
    const memoryConfig = Cypress.expose('memoryTracking') || {};
    const enableMemoryTracking = memoryConfig.enabled;

    if (enableMemoryTracking) {
        cy.startMemoryTracking({
            testTitle: this.currentTest?.title,
            interval: 1000, // Измерения каждую секунду для автоматического режима
        });
    }
});

afterEach(function () {
    const memoryConfig = Cypress.expose('memoryTracking') || {};
    const enableMemoryTracking = memoryConfig.enabled;

    // Всегда останавливаем отслеживание в конце теста
    if (enableMemoryTracking || isTracking) {
        cy.stopMemoryTracking();
    }

    // Очищаем буфер памяти на всякий случай
    cy.window().then((win) => {
        if (win.cypressMemoryBuffer) {
            win.cypressMemoryBuffer = [];
        }
    });
});