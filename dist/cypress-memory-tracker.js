// cypress-memory-tracker.js
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class MemoryTracker {
    constructor() {
        this.dataFile = path.join(process.cwd(), 'cypress', 'temp', 'memory-tracking.json');
        this.isEnabled = false;
        this.trackSpecOnly = false;
        this.debugEnabled = false;
        this.ensureTempDir();
    }

    ensureTempDir() {
        const tempDir = path.dirname(this.dataFile);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    }

    configure(config) {
        const memoryConfig = config.env.memoryTracking || {};
        this.isEnabled     = memoryConfig.enabled === true;
        this.trackSpecOnly = memoryConfig.trackSpecOnly === true;
        this.debugEnabled  = memoryConfig.debug === true;

        if (this.isEnabled && this.debugEnabled) {
            this.logDebug(
                chalk.green('✔ Memory tracking enabled'),
                chalk.gray(`trackSpecOnly=${this.trackSpecOnly}`),
                chalk.gray(`debug=${this.debugEnabled}`)
            );
        }
    }

    logDebug(...args) {
        if (!this.debugEnabled) return;
        const prefix = chalk.blue('[DEBUG]');
        console.log(prefix, ...args);
    }

    initializeData() {
        if (!this.isEnabled) return;
        this.logDebug(chalk.yellow('Initializing memory tracking data…'));
        const initialData = {
            runStartTime: new Date().toISOString(),
            specs: {},
            tests: {},
            config: {
                trackSpecOnly: this.trackSpecOnly,
                debug: this.debugEnabled,
            },
        };
        this.saveData(initialData);
    }

    saveData(data) {
        try {
            const count = Object.keys(data.specs).length;
            this.logDebug(chalk.cyan('Saving data:'), chalk.magenta(`${count} spec(s)`));
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (err) {
            if (this.debugEnabled) {
                console.error(chalk.red('[DEBUG] Failed to save memory data:'), err.message);
            }
        }
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const content = fs.readFileSync(this.dataFile, 'utf8');
                const data = JSON.parse(content);
                const count = Object.keys(data.specs).length;
                this.logDebug(chalk.cyan('Loaded data:'), chalk.magenta(`${count} spec(s)`));
                return data;
            }
        } catch (err) {
            if (this.debugEnabled) {
                console.error(chalk.red('[DEBUG] Failed to load memory data:'), err.message);
            }
        }
        this.logDebug(chalk.yellow('No data file found; returning null'));
        return null;
    }

    recordSpecMemory(specName, memoryData) {
        if (!this.isEnabled) return;
        this.logDebug(chalk.gray(`recordSpecMemory called for "${specName}"`));

        const data = this.loadData();
        if (!data) return;

        if (!data.specs[specName]) {
            this.logDebug(chalk.gray(`Creating new spec entry: "${specName}"`));
            data.specs[specName] = { samples: [], tests: {}, startTime: new Date().toISOString() };
        }

        data.specs[specName].samples.push({
            timestamp:   memoryData.timestamp || Date.now(),
            usedJSHeapSize: memoryData.usedJSHeapSize,
            totalJSHeapSize: memoryData.totalJSHeapSize,
            jsHeapSizeLimit: memoryData.jsHeapSizeLimit,
        });

        this.saveData(data);
    }

    recordTestMemory(specName, testTitle, memoryData, specPath) {
        if (!this.isEnabled) return;
        this.logDebug(chalk.gray(`recordTestMemory: "${testTitle}" in "${specName}"`));

        const data = this.loadData();
        if (!data) return;

        const testKey = `${specName}::${testTitle}`;
        // always collect test data
        if (!data.tests[testKey]) {
            data.tests[testKey] = {
                specPath: specName,
                testTitle,
                samples: [],
                startTime: new Date().toISOString(),
            };
        }
        data.tests[testKey].samples.push({
            timestamp:   memoryData.timestamp || Date.now(),
            usedJSHeapSize: memoryData.usedJSHeapSize,
            totalJSHeapSize: memoryData.totalJSHeapSize,
            jsHeapSizeLimit: memoryData.jsHeapSizeLimit,
        });

        // always collect spec data
        if (!data.specs[specName]) {
            this.logDebug(chalk.gray(`Creating new spec entry from recordTestMemory: "${specName}"`));
            data.specs[specName] = { samples: [], tests: {} };
        }
        if (!data.specs[specName].tests[testTitle]) {
            data.specs[specName].tests[testTitle] = { samples: [] };
        }
        data.specs[specName].tests[testTitle].samples.push({
            timestamp:   memoryData.timestamp || Date.now(),
            usedJSHeapSize: memoryData.usedJSHeapSize,
            totalJSHeapSize: memoryData.totalJSHeapSize,
            jsHeapSizeLimit: memoryData.jsHeapSizeLimit,
        });

        this.saveData(data);
    }

    recordMemoryBatch(batchData) {
        if (!this.isEnabled || !Array.isArray(batchData.batch)) return;
        const data = this.loadData();
        if (!data) return;

        let modified = false;
        batchData.batch.forEach(item => {
            const { specName, testTitle, memory } = item;
            const testKey = `${specName}::${testTitle}`;

            // tests
            if (!data.tests[testKey]) {
                data.tests[testKey] = { specPath: specName, testTitle, samples: [] };
            }
            data.tests[testKey].samples.push(memory);
            modified = true;

            // specs
            if (!data.specs[specName]) {
                data.specs[specName] = { samples: [], tests: {} };
            }
            if (!data.specs[specName].tests[testTitle]) {
                data.specs[specName].tests[testTitle] = { samples: [] };
            }
            data.specs[specName].tests[testTitle].samples.push(memory);
            modified = true;
        });

        if (modified) this.saveData(data);
        if (batchData.totalBatches > 1) {
            this.logDebug(chalk.gray(`Processed memory batch ${batchData.batchIndex + 1}/${batchData.totalBatches}`));
        }
    }

    calculateStats(samples) {
        if (!samples || samples.length === 0) {
            return { min: 0, max: 0, avg: 0, count: 0 };
        }
        const values = samples.map(s => s.usedJSHeapSize || 0);
        const min = Math.min(...values), max = Math.max(...values);
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        return {
            min: Math.round((min / 1024 / 1024) * 100) / 100,
            max: Math.round((max / 1024 / 1024) * 100) / 100,
            avg: Math.round((avg / 1024 / 1024) * 100) / 100,
            count: values.length,
        };
    }

    aggregateSpecStats(specData) {
        const all = [];
        Object.values(specData.tests || {}).forEach(td => all.push(...td.samples));
        if (Array.isArray(specData.samples)) all.push(...specData.samples);
        return this.calculateStats(all);
    }

    findMaxMemoryTest(specData) {
        let max = 0, name = '';
        Object.entries(specData.tests || {}).forEach(([t, td]) => {
            const stats = this.calculateStats(td.samples);
            if (stats.max > max) { max = stats.max; name = t; }
        });
        return { testName: name, memory: max };
    }

    generateReport() {
        if (!this.isEnabled) {
            console.log(chalk.red('Memory tracking was disabled for this run'));
            return;
        }
        this.logDebug(chalk.yellow('Generating final report…'));
        const data = this.loadData();
        if (!data) {
            console.log(chalk.red('No memory data found for report generation.'));
            return;
        }

        console.log(chalk.bold('\n' + '='.repeat(130)));
        console.log(chalk.bold('🚔   MEMORY USAGE REPORT 🚔'.padStart(78)));
        console.log(chalk.bold('='.repeat(130)));

        const totalSpecs = Object.keys(data.specs).length;
        const totalTests = Object.keys(data.tests).length;
        console.log(
            chalk.green('Total specs analyzed:'), chalk.white(totalSpecs),
            chalk.green('| Total tests analyzed:'), chalk.white(totalTests)
        );

        // specs report
        this.generateSpecReport(data.specs);

        // tests report if desired
        if (!this.trackSpecOnly) {
            this.generateTestReport(data.tests);
        }

        console.log('\n');
        console.log(chalk.bold('='.repeat(130)));
    }

    generateSpecReport(specs) {
        console.log(chalk.blue('\n♿️ Использование памяти [сьюиты]:'));
        console.log('-'.repeat(130));
        console.log(chalk.blueBright(
            '| Spec File'.padEnd(51) +
            '| Min (MB)'.padEnd(13) +
            '| Avg (MB)'.padEnd(13) +
            '| Max (MB)'.padEnd(13) +
            '| Measurements '.padEnd(16) +
            '| Peak Memory Test'.padEnd(23) + '|'
        ));
        console.log('-'.repeat(130));

        Object.entries(specs)
            .sort(([,a],[,b]) => this.aggregateSpecStats(b).max - this.aggregateSpecStats(a).max)
            .forEach(([name, data]) => {
                const stats = this.aggregateSpecStats(data);
                const peak = this.findMaxMemoryTest(data).testName || 'N/A';
                console.log(
                    `| ${name.padEnd(48)} | ${stats.min.toString().padEnd(10)} | ${stats.avg.toString().padEnd(10)} | ${stats.max.toString().padEnd(10)} | ${stats.count.toString().padEnd(13)} | ${peak.substring(0,20).padEnd(20)} |`
                );
            });

        console.log('-'.repeat(130));
    }

    generateTestReport(tests) {
        console.log(chalk.blue('\n♿️ Использование памяти [топ 50 тестов]:'));
        console.log('-'.repeat(130));
        console.log(chalk.blueBright(
            '| Test Name'.padEnd(51) +
            '| Spec File'.padEnd(27) +
            '| Min (MB)'.padEnd(12) +
            '| Avg (MB)'.padEnd(12) +
            '| Max (MB)'.padEnd(12) +
            '| Measurements '.padEnd(12) + '|'
        ));
        console.log('-'.repeat(130));

        Object.values(tests)
            .sort((a,b) => this.calculateStats(b.samples).max - this.calculateStats(a.samples).max)
            .slice(0,50)
            .forEach(td => {
                const stats = this.calculateStats(td.samples);
                const title = td.testTitle.length > 40 ? td.testTitle.slice(0,37)+'...' : td.testTitle;
                console.log(
                    `| ${title.padEnd(48)} | ${td.specPath.padEnd(24)} | ${stats.min.toString().padEnd(9)} | ${stats.avg.toString().padEnd(9)} | ${stats.max.toString().padEnd(9)} | ${stats.count.toString().padEnd(12)} |`
                );
            });

        if (Object.keys(tests).length > 50) {
            console.log(`| ... and ${Object.keys(tests).length - 50} more tests`.padEnd(123) + '|');
        }
        console.log('-'.repeat(130));
    }

    cleanup() {
        try {
            if (fs.existsSync(this.dataFile)) {
                fs.unlinkSync(this.dataFile);
                this.logDebug(chalk.green('Memory tracking data cleaned up.'));
            }
        } catch (err) {
            if (this.debugEnabled) {
                console.error(chalk.red('[DEBUG] Failed to cleanup memory data file:'), err.message);
            }
        }
    }
}

module.exports = MemoryTracker;
