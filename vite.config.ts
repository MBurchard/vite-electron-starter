import type {ChildProcess} from 'node:child_process';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {builtinModules} from 'node:module';
import {resolve} from 'node:path';
import process from 'node:process';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {Ansi} from '@mburchard/bit-log/dist/ansi.js';
import {ConsoleAppender} from '@mburchard/bit-log/dist/appender/ConsoleAppender.js';
import electronPath from 'electron';
import {
  build,
  createServer,
  defineConfig,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from 'vite';

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

const log = useLog('vite.config');

/**
 * IntelliJ is unable to detect, that a Plugin can have this both methods...
 */
interface CustomPlugin extends Plugin {
  buildStart?: () => Promise<void>;
  buildEnd?: () => void;
}

export default defineConfig(({command, mode}): UserConfig => {
  log.debug(`define config for command '${Ansi.cyan(command)}' and mode '${Ansi.cyan(mode)}'`);
  process.env.NODE_ENV = mode;

  log.info(`Starting Electron in ${Ansi.cyan(process.env.NODE_ENV)} mode`);
  return {
    plugins: [
      vitePluginAppDevServer(),
      vitePluginElectronPreloadBuild(),
      vitePluginElectronHotReload(),
    ],
    root: 'modules/electron',
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: '../../dist-electron',
      sourcemap: 'inline',
      reportCompressedSize: false,
      rollupOptions: {
        external: id => id === 'electron' || id.includes('node:') || builtinModules.includes(id) ||
          (!id.startsWith('@common/') && /^[^./]/.test(id)),
        input: {
          main: resolve(__dirname, 'modules/electron/src/main.ts'),
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
    },
    resolve: {
      alias: {
        '@common': resolve(__dirname, 'modules/common/src'),
      },
    },
  };
});

function vitePluginAppDevServer(): CustomPlugin {
  return {
    name: 'vite-plugin-app-dev-server',
    async buildStart() {
      log.info('Serving App Frontend');
      const server = await createServer({
        configFile: false,
        root: 'modules/app',
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: '../../dist',
          reportCompressedSize: false,
          sourcemap: 'inline',
        },
        resolve: {
          alias: {
            '@app': resolve(__dirname, 'modules/app/src'),
            '@common': resolve(__dirname, 'modules/common/src'),
          },
        },
      });
      await server.listen();
      log.info('Serving App with Vite Dev Server on:', server.resolvedUrls?.local[0]);
      process.env.VITE_DEV_SERVER_URL = server.resolvedUrls?.local[0];
    },
  };
}

function vitePluginElectronHotReload(): CustomPlugin {
  let electronApp: ChildProcess | null = null;
  let preloadPlugin: PluginOption | null | undefined = null;
  let electronBuildReady = false;
  let preloadBuildReady = false;

  function starteElectron() {
    if (!electronBuildReady || !preloadBuildReady) {
      return;
    }
    if (electronApp !== null) {
      electronApp.removeListener('exit', process.exit);
      electronApp.kill('SIGINT');
      electronApp = null;
    }
    electronApp = spawn(String(electronPath), ['--inspect', '.'], {
      stdio: 'inherit',
    });
    electronApp.addListener('exit', process.exit);
  }

  return {
    name: 'vite-plugin-electron-hot-reload',
    config(config, env) {
      log.debug('configure vite-plugin-electron-hot-reload:', env);

      preloadPlugin = config.plugins?.find(p =>
        p != null && typeof p === 'object' && 'name' in p && p?.name === 'vite-plugin-electron-preload-build');
      if (!preloadPlugin) {
        throw new Error('vite-plugin-electron-preload-build not found');
      }

      if (preloadPlugin && 'api' in preloadPlugin) {
        preloadPlugin.api.onBuildEnd(() => {
          preloadBuildReady = true;
          starteElectron();
        });
      }

      return {
        build: {
          watch: {},
        },
      };
    },
    buildEnd() {
      electronBuildReady = true;
      starteElectron();
    },
  };
}

function vitePluginElectronPreloadBuild(): CustomPlugin {
  const eventEmitter = new EventEmitter();
  let hasBeenBuild = false;

  return {
    name: 'vite-plugin-electron-preload-build',
    async buildStart() {
      log.debug('Compiling Preload Script...');
      const watcher = await build({
        configFile: false,
        mode: 'development',
        root: 'modules/electron-preload',
        build: {
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, 'modules/electron-preload/src/preload.ts'),
            formats: ['cjs'],
          },
          minify: false,
          outDir: '../../dist-electron',
          reportCompressedSize: false,
          rollupOptions: {
            input: resolve(__dirname, 'modules/electron-preload/src/preload.ts'),
            external: id => id === 'electron' || id.includes('node:') || builtinModules.includes(id),
            output: {
              entryFileNames: '[name].js',
              format: 'cjs',
            },
          },
          sourcemap: 'inline',
          watch: {},
        },
        resolve: {
          alias: {
            '@common': resolve(__dirname, 'modules/common/src'),
          },
        },
      });
      if ('on' in watcher) {
        watcher.on('event', (event: any) => {
          if (event.code === 'BUNDLE_END') {
            hasBeenBuild = true;
            log.debug('Preload Script compiled and watching for changes');
            eventEmitter.emit('build_end');
          }
        });
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
