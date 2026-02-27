/**
 * vite.config.ts
 *
 * @file Vite configuration with four custom plugins that orchestrate the full Electron build pipeline:
 * multipage HTML resolution, Electron main process build, preload script compilation (CJS), and
 * coordinated hot-reload during development. An EventEmitter synchronizes the build order, so Electron
 * only starts once both the main process and preload builds have completed.
 *
 * @author Martin Burchard
 */
import type {ChildProcess} from 'node:child_process';
import type {Plugin, PluginOption, UserConfig} from 'vite';
import type {CustomPlugin, PageConfig} from './types/env.js';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {builtinModules} from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {Ansi} from '@mburchard/bit-log/ansi';
import {ConsoleAppender} from '@mburchard/bit-log/appender/ConsoleAppender';
import electronBinary from 'electron';
import {build, defineConfig} from 'vite';
import {viteElectronConfig as cfg} from './project.config.js';

// ---- Logging ----

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
      colored: true,
      pretty: true,
    },
  },
  root: {
    appender: ['CONSOLE'],
    level: 'DEBUG',
  },
});

const log = useLog('vite.config', 'INFO');

// ---- App Frontend Configuration ----

export default defineConfig(({command, mode}): UserConfig => {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = mode;
  }
  const minify = mode === 'production';
  const pageDevTools = Object.fromEntries(
    Object.entries(cfg.app.pages).map(([pageName, page]) => [pageName, page.devTools === true]),
  );
  const pageDevToolsJson = JSON.stringify(pageDevTools);

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
    base: './',
    define: {
      'import.meta.env.VITE_APP_PAGE_DEVTOOLS': pageDevToolsJson,
    },
    build: {
      emptyOutDir: true,
      minify,
      outDir: cfg.output.app,
      reportCompressedSize: false,
      rollupOptions: {
        input: rollupInput,
      },
      sourcemap: 'inline',
    },
    plugins: [
      vitePluginMultiPage(),
      {
        name: 'vite-plugin-dev-server-url',
        configureServer(server) {
          server.httpServer?.once('listening', () => {
            /**
             * Poll for the resolved dev server URL and store it in the environment.
             */
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
      vitePluginElectron(command, pageDevToolsJson),
    ],
    resolve: {
      alias: {
        '@assets': path.resolve(__dirname, cfg.app.root, 'assets'),
        '@app': path.resolve(__dirname, cfg.app.root, 'src'),
        '@common': path.resolve(__dirname, cfg.common.root, 'src'),
        '@css': path.resolve(__dirname, cfg.app.root, 'css'),
      },
    },
    server: {
      watch: {
        ignored: ['**/project.config.ts', '**/vite.config.ts', '**/vite-env.d.ts'],
      },
    },
  };
});

// ---- Electron Main Process Plugin ----

/**
 * Build the Electron main process as ESM with a preserved module structure. Nests the preload and hot-reload plugins
 * as sub-plugins so the full backend pipeline runs within a single Vite build context.
 *
 * @param command - Vite command: 'serve' enables watch mode, 'build' produces a one-shot output.
 * @param pageDevToolsJson - JSON string of per-page devTools flags injected as define constant.
 * @returns A Vite plugin that triggers the Electron build inside its configResolved hook.
 */
function vitePluginElectron(command: 'serve' | 'build', pageDevToolsJson: string): CustomPlugin {
  const electronPath = path.resolve(__dirname, cfg.electron.root, 'src');
  log.debug('Electron Path:', electronPath);
  const commonPath = path.resolve(__dirname, cfg.common.root, 'src');
  log.debug('Common Path:', commonPath);

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
        define: {
          'import.meta.env.VITE_APP_PAGE_DEVTOOLS': pageDevToolsJson,
        },
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
            external: (id) => {
              const _path = path.normalize(id);
              if (_path.startsWith(path.resolve(electronPath, 'common') + path.sep)) {
                const msg = `Name conflict with common module and common folder in '${cfg.electron.root}'`;
                log.error(msg);
                throw new Error(msg);
              }
              if (_path.includes('@common')) {
                log.debug('EXTERNAL CHECK:', _path, `-> ${Ansi.green('internal')}`);
                return false;
              }

              const isExternal =
                _path === 'electron' || _path.includes('node:') || builtinModules.includes(_path) ||
                (!_path.includes(electronPath) && !_path.includes(commonPath) && /^[^./]/.test(id));

              log.debug('EXTERNAL CHECK:', id, `: ${isExternal ? Ansi.red('external') : Ansi.green('internal')}`);
              return isExternal;
            },
            input: {
              main: path.resolve(electronPath, 'main.ts'),
            },
            preserveEntrySignatures: 'strict',
            output: {
              format: 'esm',
              entryFileNames: (chunk) => {
                if (!chunk.facadeModuleId) {
                  log.error('Skipping chunk with null facadeModuleId:', chunk);
                  return 'unknown.js';
                }
                const chunkPath = path.normalize(chunk.facadeModuleId);
                const relativePath = path.relative(electronPath, chunkPath).replace(/\.ts$/, '.js');
                log.debug('TEST:', chunkPath, '->', relativePath);
                if (relativePath.startsWith('..') && chunkPath.startsWith(commonPath)) {
                  return path.join('common', path.relative(commonPath, chunkPath))
                    .replace(/\.ts$/, '.js');
                }
                return relativePath;
              },
              preserveModules: true,
              exports: 'named',
            },
          },
          ...(command === 'serve' && {
            watch: {
              include: [`${cfg.common.root}/**/*.ts`, `${cfg.electron.root}/**/*.ts`],
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

// ---- Electron Hot Reload Plugin ----

/**
 * Coordinate Electron process lifecycle during development. Waits for both the main process and preload builds to
 * complete before spawning Electron and restarts it on later rebuilds. Registers SIGINT/SIGTERM handlers to
 * ensure clean shutdown.
 *
 * @param command - Vite command: hot-reload logic only activates in 'serve' mode.
 * @returns A Vite plugin that manages the Electron child process.
 */
function vitePluginElectronHotReload(command: 'serve' | 'build'): CustomPlugin {
  let electronApp: ChildProcess | null = null;
  let preloadPlugin: PluginOption | null | undefined = null;
  let electronBuildReady = false;
  let preloadBuildReady = false;

  /**
   * Handle Electron process exit by stopping the Vite dev server after a short delay.
   *
   * @param code - The exit code from the Electron process, or null if killed by signal.
   */
  function cleanExit(code: number | null) {
    log.info('Electron has been stopped');
    setTimeout(() => {
      log.info('stopping Vite process too');
      process.exit(code);
    }, 500);
  }

  /**
   * Spawn or restart the Electron process once both main and preload builds are ready.
   */
  function startElectron() {
    if (!electronBuildReady || !preloadBuildReady) {
      return;
    }
    if (electronApp !== null) {
      electronApp.removeListener('exit', cleanExit);
      electronApp.kill('SIGINT');
      electronApp = null;
    }
    electronApp = spawn(String(electronBinary), ['--inspect', '.'], {
      stdio: 'inherit',
    });
    electronApp.addListener('exit', cleanExit);
  }

  /**
   * Register process signal handlers to cleanly terminate the Electron child process on shutdown.
   */
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
            startElectron();
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
        startElectron();
      }
    },
  };
}

// ---- Electron Preload Plugin ----

/**
 * Compile the preload script as a CommonJS bundle. Runs as a nested build inside the Electron plugin's closeBundle
 * hook. In serve mode, sets up a file watcher and emits 'build_end' events consumed by the hot-reload plugin.
 *
 * @param command - Vite command: 'serve' enables watch mode with rebuild notifications.
 * @returns A Vite plugin with an `api.onBuildEnd` callback for cross-plugin coordination.
 */
function vitePluginElectronPreload(command: 'serve' | 'build'): CustomPlugin {
  const eventEmitter = new EventEmitter();
  let hasBeenBuilt = false;

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
              include: [`${cfg.common.root}/**/*.ts`, `${cfg.preload.root}/**/*.ts`],
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
              hasBeenBuilt = true;
              log.debug('Preload Script compiled and watching for changes');
              eventEmitter.emit('build_end');
            }
          });
        }
      }
    },
    api: {
      /**
       * Register a callback that fires after each successful preload build.
       *
       * @param callback - Invoked once the preload bundle is ready.
       */
      onBuildEnd(callback: () => void) {
        eventEmitter.on('build_end', callback);
        if (hasBeenBuilt) {
          callback();
        }
      },
    },
  };
}

// ---- Multi-Page Plugin ----

/**
 * Resolve virtual `virtual:page:NAME.html` modules to real HTML templates, inject script modules and template
 * variables (`PAGE_TITLE`, `PAGE`). Supports both build mode (rollup input) and dev server (transformIndexHtml).
 *
 * @returns A Vite plugin handling multipage HTML resolution and transformation.
 */
function vitePluginMultiPage(): Plugin {
  const contextMap = new Map<string, PageConfig>();

  /**
   * Read an HTML template from disk and inject the page's script modules before `</body>`. In development mode,
   * the Vite client script is also injected into `<head>`.
   *
   * @param pageConfig - The page configuration containing template path and module list.
   * @returns The processed HTML string, or null if the template could not be loaded.
   */
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
      let result = fileContent;
      if (process.env.NODE_ENV === 'development') {
        // noinspection HtmlUnknownTarget
        result = result.replace('head>', 'head>\n<script type="module" src="/@vite/client"></script>');
      }
      const modules = pageConfig.modules
        .map(module => `  <script type="module" src="${module.startsWith('./') ? module : `./${module}`}"></script>`)
        .join('\n');
      result = result.replace('</body>', `${modules}\n</body>`);
      log.debug('HTML template with injected modules:', result);
      return result;
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
        pageConfig.id = currentPage;
        const resolvedId = path.resolve(__dirname, cfg.app.root, `${currentPage}.html`);
        log.debug(`resolve ID:`, id, 'to: ', resolvedId);
        contextMap.set(resolvedId, pageConfig);
        return resolvedId;
      }
    },

    transformIndexHtml(html, ctx) {
      if (ctx.filename) {
        const filename = path.join(ctx.filename);
        const pageConfig = contextMap.has(filename) ? contextMap.get(filename) : null;
        if (pageConfig) {
          return html.replace('<%= PAGE_TITLE %>', pageConfig.title || '').replace('<%= PAGE %>', pageConfig.id ?? '');
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
        return html.replace('<%= PAGE_TITLE %>', pageConfig.title ?? '').replace('<%= PAGE %>', pageName);
      }
      return template.replace('<%= PAGE_TITLE %>', pageConfig.title ?? '').replace('<%= PAGE %>', pageName);
    },
  };
}
