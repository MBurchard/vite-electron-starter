import type {CustomPlugin, PageConfig} from './vite-env.d.ts';
import {type ChildProcess, spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {builtinModules} from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {Ansi} from '@mburchard/bit-log/dist/ansi.js';
import {ConsoleAppender} from '@mburchard/bit-log/dist/appender/ConsoleAppender.js';
import {LogLevel} from '@mburchard/bit-log/dist/definitions.js';
import electronPath from 'electron';
import {build, defineConfig, type Plugin, type PluginOption, type UserConfig} from 'vite';
import {viteElectronConfig as cfg} from './project.config.js';

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
      colored: true,
    },
  },
  root: {
    appender: ['CONSOLE'],
    level: 'DEBUG',
  },
});

const log = useLog('vite.config', LogLevel.INFO);

export default defineConfig(({command, mode}): UserConfig => {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = mode;
  }
  const minify = mode === 'production' && false; // will be changed later, when minification is really wanted

  log.info(`${Ansi.magenta(command === 'serve' ? 'Serving' : 'Building')} App Frontend`);

  let rollupInput;
  if (command === 'build') {
    rollupInput = Object.fromEntries(
      Object.entries(cfg.app.pages).map(([name]) => [
        `${name}`,
        `virtual:page:${name}.html`,
      ]),
    );
    log.debug('Rollup Input', rollupInput);
  }

  return {
    root: cfg.app.root,
    build: {
      emptyOutDir: true,
      minify,
      outDir: cfg.output.app,
      reportCompressedSize: false,
      rollupOptions: {
        input: rollupInput,
      },
      sourcemap: 'inline', // will decide later if we deploy without source maps
    },
    plugins: [
      vitePluginMultiPage(),
      {
        name: 'vite-plugin-dev-server-url',
        configureServer(server) {
          server.httpServer?.once('listening', () => {
            function checkServerURL() {
              const serverURL = server.resolvedUrls?.local[0];
              if (serverURL !== undefined) {
                log.info('Serving App with Vite Dev Server on:', serverURL);
                process.env.VITE_DEV_SERVER_URL = serverURL;
                return;
              }
              log.debug('waiting for server url...');
              setTimeout(checkServerURL, 1);
            }
            checkServerURL();
          });
        },
      },
      vitePluginElectron(command),
    ],
    resolve: {
      alias: {
        '@app': path.resolve(__dirname, cfg.app.root, 'src'),
        '@common': path.resolve(__dirname, cfg.common.root, 'src'),
      },
    },
    server: {
      watch: {
        ignored: ['**/project.config.ts', '**/vite.config.ts', '**/vite-env.d.ts'],
      },
    },
  };
});

function vitePluginElectron(command: 'serve' | 'build'): CustomPlugin {
  return {
    name: 'vite-plugin-electron',
    configResolved() {
      if (command === 'serve') {
        log.info(`Starting Electron in ${Ansi.cyan(process.env.NODE_ENV ?? '')} mode`);
      } else {
        log.info(`Building Electron for ${Ansi.cyan(process.env.NODE_ENV ?? '')}`);
      }
      build({
        root: cfg.electron.root,
        plugins: [
          vitePluginElectronPreload(command),
          vitePluginElectronHotReload(command),
        ],
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: cfg.output.electron,
          sourcemap: 'inline',
          reportCompressedSize: false,
          rollupOptions: {
            external: id => id === 'electron' || id.includes('node:') || builtinModules.includes(id) ||
              (!id.startsWith('@common/') && /^[^./]/.test(id)),
            input: {
              main: path.resolve(__dirname, cfg.electron.root, 'src/main.ts'),
            },
            preserveEntrySignatures: 'strict',
            output: {
              format: 'esm',
              entryFileNames: '[name].js',
              preserveModules: true,
              preserveModulesRoot: 'electron',
              exports: 'named',
            },
          },
          ...(command === 'serve' && {
            watch: {
              include: [cfg.common.root, cfg.electron.root],
            },
          }),
        },
        resolve: {
          alias: {
            '@common': path.resolve(__dirname, cfg.common.root, 'src'),
          },
        },
      }).catch(reason => log.error('Electron Backend build failed:', reason));
    },
  };
}

function vitePluginElectronHotReload(command: 'serve' | 'build'): CustomPlugin {
  let electronApp: ChildProcess | null = null;
  let preloadPlugin: PluginOption | null | undefined = null;
  let electronBuildReady = false;
  let preloadBuildReady = false;

  function cleanExit(code: number | null) {
    log.info('Electron has been stopped');
    setTimeout(() => {
      log.info('stopping Vite process too');
      process.exit(code);
    }, 500);
  }

  function starteElectron() {
    if (!electronBuildReady || !preloadBuildReady) {
      return;
    }
    if (electronApp !== null) {
      electronApp.removeListener('exit', cleanExit);
      electronApp.kill('SIGINT');
      electronApp = null;
    }
    electronApp = spawn(String(electronPath), ['--inspect', '.'], {
      stdio: 'inherit',
    });
    electronApp.addListener('exit', cleanExit);
  }

  function setupExitHandlers() {
    process.on('SIGINT', () => {
      if (electronApp) {
        log.info('Stopping Electron process before exiting Vite serve...');
        electronApp.kill('SIGINT');
      }
      process.exit();
    });

    process.on('SIGTERM', () => {
      if (electronApp) {
        log.info('Stopping Electron process before exiting Vite serve...');
        electronApp.kill('SIGTERM');
      }
      process.exit();
    });
  }

  return {
    name: 'vite-plugin-electron-hot-reload',
    config(config, env) {
      log.debug('configure vite-plugin-electron-hot-reload:', env);

      preloadPlugin = config.plugins?.find(p =>
        p != null && typeof p === 'object' && 'name' in p && p?.name === 'vite-plugin-electron-preload');
      if (!preloadPlugin) {
        throw new Error('vite-plugin-electron-preload not found');
      }

      if (preloadPlugin && 'api' in preloadPlugin) {
        preloadPlugin.api.onBuildEnd(() => {
          preloadBuildReady = true;
          if (command === 'serve') {
            starteElectron();
          }
        });
      }
      if (command === 'serve') {
        setupExitHandlers();
      }
    },
    buildEnd() {
      electronBuildReady = true;
      if (command === 'serve') {
        starteElectron();
      }
    },
  };
}

function vitePluginElectronPreload(command: 'serve' | 'build'): CustomPlugin {
  const eventEmitter = new EventEmitter();
  let hasBeenBuild = false;

  const entryPoint = path.resolve(__dirname, cfg.preload.root, 'src', 'preload.ts');

  return {
    name: 'vite-plugin-electron-preload',
    async closeBundle() {
      log.debug('Compiling Preload Script...');
      const watcher = await build({
        configFile: false,
        root: cfg.preload.root,
        build: {
          emptyOutDir: false,
          lib: {
            entry: entryPoint,
            formats: ['cjs'],
          },
          minify: false,
          outDir: cfg.output.electron,
          reportCompressedSize: false,
          rollupOptions: {
            input: entryPoint,
            external: id => id === 'electron' || id.includes('node:') || builtinModules.includes(id),
            output: {
              entryFileNames: '[name].js',
              format: 'cjs',
            },
          },
          sourcemap: 'inline',
          ...(command === 'serve' && {
            watch: {
              include: [cfg.common.root, cfg.preload.root],
            },
          }),
        },
        resolve: {
          alias: {
            '@common': path.resolve(__dirname, cfg.common.root, 'src'),
          },
        },
      });
      if (command === 'serve') {
        if ('on' in watcher) {
          watcher.on('event', (event: any) => {
            if (event.code === 'BUNDLE_END') {
              hasBeenBuild = true;
              log.debug('Preload Script compiled and watching for changes');
              eventEmitter.emit('build_end');
            }
          });
        }
      }
    },
    api: {
      onBuildEnd(callback: () => void) {
        eventEmitter.on('build_end', callback);
        if (hasBeenBuild) {
          callback();
        }
      },
    },
  };
}

function vitePluginMultiPage(): Plugin {
  const contextMap = new Map<string, PageConfig>();

  function loadTemplate(pageConfig: PageConfig | undefined | null): string | null {
    const templatePath = pageConfig?.template ?
        path.resolve(__dirname, cfg.app.root, 'templates', pageConfig.template) :
        path.resolve(__dirname, cfg.app.root, 'index.html');
    try {
      const fileContent = fs.readFileSync(templatePath, 'utf-8');
      log.debug('HTML template loaded from', templatePath, '->', fileContent);
      if (!pageConfig?.modules || pageConfig.modules.length === 0) {
        log.warn('No modules found for pageConfig:', pageConfig);
        return fileContent;
      }
      const modules = pageConfig.modules
        .map(module => `  <script type="module" src="${module.startsWith('./') ? module : `./${module}`}"></script>`)
        .join('\n');
      const injected = fileContent.replace('</body>', `${modules}\n</body>`);
      log.debug('HTML template with injected modules:', injected);
      return injected;
    } catch (e) {
      log.error('Failed to load template for page:', templatePath, e);
      return null;
    }
  }

  return {
    name: 'vite-plugin-multi-page',

    load(id) {
      const pageConfig = contextMap.has(id) ? contextMap.get(id) : null;
      if (pageConfig) {
        log.debug(`vite-plugin-multi-page.load(${Ansi.cyan(id)})`);
        return loadTemplate(contextMap.get(id) ?? null);
      }
    },

    resolveId(id) {
      const match = id.match(/^virtual:page:(.+)\.html$/);
      if (match) {
        const currentPage = match[1];
        const pageConfig = cfg.app.pages[currentPage];
        if (!pageConfig) {
          throw new Error(`No page config available for ${Ansi.cyan(currentPage)}, please check your configuration.`);
        }
        const resolvedId = path.resolve(__dirname, cfg.app.root, `${currentPage}.html`);
        log.debug(`resolve ID:`, id, 'to: ', resolvedId);
        contextMap.set(resolvedId, pageConfig);
        return resolvedId;
      }
      return id;
    },

    transformIndexHtml(html, ctx) {
      if (ctx.filename) {
        const pageConfig = contextMap.has(ctx.filename) ? contextMap.get(ctx.filename) : null;
        if (pageConfig) {
          return html.replace('<%= PAGE_TITLE %>', pageConfig.title || '');
        }
      }
      if (!ctx.originalUrl) {
        log.warn('Should not reach this point');
        return html;
      }
      const pageName = ctx.originalUrl?.split('/').filter(Boolean)[0] ?? 'main';
      log.debug('pageName:', pageName);
      const pageConfig = cfg.app.pages[pageName];
      log.debug('pageConfig:', pageConfig);
      if (!pageConfig) {
        log.error('no page config found for', pageName);
        return html;
      }
      const template = loadTemplate(pageConfig);
      if (!template) {
        return html.replace('<%= PAGE_TITLE %>', pageConfig.title || '');
      }
      return template.replace('<%= PAGE_TITLE %>', pageConfig.title || '');
    },
  };
}
