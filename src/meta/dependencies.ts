import path from 'path';

import fs from 'fs';

import semver from 'semver';

import winston from 'winston';

import chalk from 'chalk';

import { paths, pluginNamePattern } from '../constants';

// added "resolveJsonModule": true to tsconfig.json
import pkg from '../../package.json';

interface depexport {
    check: () => Promise<void>;
    checkModule(moduleName : string) : Promise<boolean>;
    parseModuleData(moduleName : string, pkgData : string) : string | null;
    // have to leave moduleData as any type as replacing with semver.SemVer causes file
    // to not compile due to missing fields
    doesSatisfy(moduleData : any, packageJSONVersion : string) : boolean;
}
const Dependencies : depexport = module.exports as depexport;

let depsMissing = false;
let depsOutdated = false;

Dependencies.check = async function () {
    const modules = Object.keys(pkg.dependencies);

    winston.verbose('Checking dependencies for outdated modules');

    await Promise.all(modules.map(module => Dependencies.checkModule(module)));

    if (depsMissing) {
        throw new Error('dependencies-missing');
    } else if (depsOutdated && global.env !== 'development') {
        throw new Error('dependencies-out-of-date');
    }
};

Dependencies.checkModule = async function (moduleName) {
    try {
        let pkgData = await fs.promises.readFile(path.join(paths.nodeModules, moduleName, 'package.json'), 'utf8');
        pkgData = Dependencies.parseModuleData(moduleName, pkgData) || '';

        const satisfies = Dependencies.doesSatisfy(pkgData, pkg.dependencies[moduleName] as string);
        return satisfies;
    } catch (err) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        if (err.code === 'ENOENT' && pluginNamePattern.test(moduleName)) {
            winston.warn(`[meta/dependencies] Bundled plugin ${moduleName} not found, skipping dependency check.`);
            return true;
        }
        throw err;
    }
};

Dependencies.parseModuleData = function (moduleName, pkgData) {
    try {
        pkgData = JSON.parse(pkgData) as string;
    } catch (e) {
        winston.warn(`[${chalk.red('missing')}] ${chalk.bold(moduleName)} is a required dependency but could not be found\n`);
        depsMissing = true;
        return null;
    }
    return pkgData;
};

Dependencies.doesSatisfy = function (moduleData, packageJSONVersion) {
    if (!moduleData) {
        return false;
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const version_name : string = moduleData.version as string;
    const versionOk : boolean = !semver.validRange(packageJSONVersion) ||
        semver.satisfies(version_name, packageJSONVersion);
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const githubRepo : boolean = (moduleData._resolved && moduleData._resolved.includes('//github.com')) as boolean;
    const satisfies : boolean = versionOk || githubRepo;
    if (!satisfies) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        winston.warn(`[${chalk.yellow('outdated')}] ${chalk.bold(moduleData.name)} installed v${version_name}, package.json requires ${packageJSONVersion}\n`);
        depsOutdated = true;
    }
    return satisfies;
};
