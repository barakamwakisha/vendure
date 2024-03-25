import { log } from '@clack/prompts';
import fs from 'fs-extra';
import path from 'node:path';
import { Directory, Node, Project, ProjectOptions, SourceFile } from 'ts-morph';

import { defaultManipulationSettings } from '../constants';

export function getTsMorphProject(options: ProjectOptions = {}) {
    const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');
    if (!fs.existsSync(tsConfigPath)) {
        throw new Error('No tsconfig.json found in current directory');
    }
    return new Project({
        tsConfigFilePath: tsConfigPath,
        manipulationSettings: defaultManipulationSettings,
        compilerOptions: {
            skipLibCheck: true,
        },
        ...options,
    });
}

export function getPluginClasses(project: Project) {
    const sourceFiles = project.getSourceFiles();

    const pluginClasses = sourceFiles
        .flatMap(sf => {
            return sf.getClasses();
        })
        .filter(c => {
            const hasPluginDecorator = c.getModifiers().find(m => {
                return Node.isDecorator(m) && m.getName() === 'VendurePlugin';
            });
            return !!hasPluginDecorator;
        });
    return pluginClasses;
}

export function addImportsToFile(
    sourceFile: SourceFile,
    options: {
        moduleSpecifier: string | SourceFile;
        namedImports?: string[];
        namespaceImport?: string;
        order?: number;
    },
) {
    const moduleSpecifier = getModuleSpecifierString(options.moduleSpecifier, sourceFile);
    const existingDeclaration = sourceFile.getImportDeclaration(
        declaration => declaration.getModuleSpecifier().getLiteralValue() === moduleSpecifier,
    );
    if (!existingDeclaration) {
        const importDeclaration = sourceFile.addImportDeclaration({
            moduleSpecifier,
            ...(options.namespaceImport ? { namespaceImport: options.namespaceImport } : {}),
            ...(options.namedImports ? { namedImports: options.namedImports } : {}),
        });
        if (options.order != null) {
            importDeclaration.setOrder(options.order);
        }
    } else {
        if (
            options.namespaceImport &&
            !existingDeclaration.getNamespaceImport() &&
            !existingDeclaration.getDefaultImport()
        ) {
            existingDeclaration.setNamespaceImport(options.namespaceImport);
        }
        if (options.namedImports) {
            const existingNamedImports = existingDeclaration.getNamedImports();
            for (const namedImport of options.namedImports) {
                if (!existingNamedImports.find(ni => ni.getName() === namedImport)) {
                    existingDeclaration.addNamedImport(namedImport);
                }
            }
        }
    }
}

function getModuleSpecifierString(moduleSpecifier: string | SourceFile, sourceFile: SourceFile): string {
    if (typeof moduleSpecifier === 'string') {
        return moduleSpecifier;
    }
    return getRelativeImportPath({ from: sourceFile, to: moduleSpecifier });
}

export function getRelativeImportPath(locations: {
    from: SourceFile | Directory;
    to: SourceFile | Directory;
}): string {
    const fromPath =
        locations.from instanceof SourceFile ? locations.from.getFilePath() : locations.from.getPath();
    const toPath = locations.to instanceof SourceFile ? locations.to.getFilePath() : locations.to.getPath();
    const fromDir = /\.[a-z]+$/.test(fromPath) ? path.dirname(fromPath) : fromPath;
    return convertPathToRelativeImport(path.relative(fromDir, toPath));
}

export function createFile(project: Project, templatePath: string) {
    const template = fs.readFileSync(templatePath, 'utf-8');
    const tempFilePath = path.join('/.vendure-cli-temp/', path.basename(templatePath));
    try {
        return project.createSourceFile(path.join('/.vendure-cli-temp/', tempFilePath), template, {
            overwrite: true,
        });
    } catch (e: any) {
        log.error(e.message);
        process.exit(1);
    }
}

export function kebabize(str: string) {
    return str
        .split('')
        .map((letter, idx) => {
            return letter.toUpperCase() === letter
                ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}`
                : letter;
        })
        .join('');
}

function convertPathToRelativeImport(filePath: string): string {
    // Normalize the path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Remove the file extension
    const parsedPath = path.parse(normalizedPath);
    return `./${parsedPath.dir}/${parsedPath.name}`.replace(/\/\//g, '/');
}
