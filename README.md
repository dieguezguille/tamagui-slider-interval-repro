# tamagui slider interval repro

`@tamagui/slider@2.7.7` starts a 1s `setInterval` when the module is evaluated. On the web build nothing guards it, so any Node process that loads the web entry of `tamagui` never exits. The user-facing symptom is `expo export --platform web` with `web.output: "static"`: it prints `Exported: dist` and then hangs forever.

Upstream issue: https://github.com/tamagui/tamagui/issues/4235

## Versions

- tamagui / @tamagui/slider 2.7.7
- expo 55.0.31 (cli 55.0.36), expo-router 55.0.18, react-native 0.83.10, react-native-web 0.21.2, react / react-dom 19.2.0
- node 24.13.0, pnpm 11.5.2, macOS 27.0 (arm64)

## Branches

| branch | what |
| --- | --- |
| `main` | stock `tamagui@2.7.7` |
| `with-fix` | same app plus a pnpm patch (`patches/@tamagui__slider@2.7.7.patch`) that appends `?.unref?.()` to the interval |

The app is one route, `app/index.tsx`, that imports `isWeb` from `tamagui` and renders a plain `Text`. No `Slider` is rendered anywhere.

## Steps

```sh
pnpm install
pnpm repro          # node: require('tamagui') and import('tamagui'), killed after 5s
pnpm repro:export   # expo export --platform web, killed 30s after "Exported:"

git checkout with-fix
pnpm install
pnpm repro
pnpm repro:export
```

`check.mjs` spawns each command, kills it once it outlives the timeout, and prints `HANG` or `OK` with timings. The script exits with 1 if anything hung.

Workaround on `main`, without the patch:

```sh
TAMAGUI_DISABLE_SLIDER_INTERVAL=1 pnpm repro
TAMAGUI_DISABLE_SLIDER_INTERVAL=1 pnpm repro:export
```

## Expected

Every command exits on its own once its work is done.

## Actual

Results from a fresh clone of this repo (the first export on a cold Metro cache takes about 8 s longer to reach `Exported:`):

| command | `main` | `main` + `TAMAGUI_DISABLE_SLIDER_INTERVAL=1` | `with-fix` |
| --- | --- | --- | --- |
| `node -e "require('tamagui')"` | HANG, killed at 5005 ms | OK, 451 ms | OK, 263–409 ms |
| `node --input-type=module -e "await import('tamagui')"` | HANG, killed at 5005 ms | OK, 388 ms | OK, 233–292 ms |
| `expo export --platform web` | HANG, `Exported: dist`, still alive 30 s later | OK, 5212 ms | OK, 4664–5786 ms |

```text
$ pnpm repro            # main
HANG  require('tamagui'): killed at 5005 ms
HANG  import('tamagui'): killed at 5005 ms

$ pnpm repro:export     # main
...
Exported: dist
HANG  expo export --platform web: killed at 31651 ms, 30015 ms after "Exported:"

$ pnpm repro:export     # with-fix
...
Exported: dist
OK    expo export --platform web: exited with code 0 after 4664 ms
```

The only handle left open is the interval:

```sh
node -e "require('tamagui'); console.log(process.getActiveResourcesInfo())"
# [ 'Timeout' ], and the process never exits
```

## Why

The published web dist (`dist/esm/Slider.mjs`, `dist/jsx/Slider.mjs`, `dist/cjs/Slider.cjs`) has the build-time `TAMAGUI_TARGET === 'web'` check already folded away, so the interval is unconditional:

```js
if (!process.env.TAMAGUI_DISABLE_SLIDER_INTERVAL) setInterval?.(() => {
  activeSliderMeasureListeners.forEach(cb => cb());
}, 1e3);
```

Expo's static renderer evaluates the web bundle in Node, so the interval is created there too and keeps the event loop alive.

## Fix on `with-fix`

```diff
 if (!process.env.TAMAGUI_DISABLE_SLIDER_INTERVAL) setInterval?.(() => {
   activeSliderMeasureListeners.forEach(cb => cb());
-}, 1e3);
+}, 1e3)?.unref?.();
```

In Node, `unref()` stops the timer from holding the process open, and it keeps firing while anything else keeps the process alive. In browsers `setInterval` returns a number, so `?.unref?.()` does nothing. The exported client bundle still contains the interval (`setInterval?.(...,1e3)?.unref?.()`).
