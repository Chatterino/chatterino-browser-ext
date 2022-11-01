# chatterino-browser-ext

[![Firefox Addon](https://img.shields.io/amo/v/chatterino_native@chatterino.com)][firefox-addon] [![Chrome Addon](https://img.shields.io/chrome-web-store/v/glknmaideaikkmemifbfkhnomoknepka)][chrome-ext]

Browser extension for [Firefox][firefox-addon] and [Chrome][chrome-ext] that provides the currently watched channel to the [Chatterino 2][chatterino] [Twitch.tv][twitch] chat client.

## Features

- Replace [Twitch][twitch]'s native chat with [Chatterino][chatterino].
- Provide the currently watched channel for display in the "watching" split.

## Contributing

Since this extension doesn't have a build step, you can load the extension directly in your browser.

On Firefox, go to the `about:debugging` page, click on `This Firefox`, click on `Load Temporary Add-on...` and select the `manifest.json` from the `src` folder.

On Chrome, go to `chrome://extensions`, enable `Developer mode` in the top right, click on `Load unpacked` and select the `src` folder from this repository.

We use `prettier` to format the code files. Run `pnpm format` to format all files.

## Communication

This extension uses [native messageing](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) to communicate with [Chatterino][chatterino]

Messages are encoded as JSON in the following structure:

```typescript
type NativeMessage =
  | {
      action: 'select';
      type: 'twitch';
      /** If chatterino should attach an instance to the browser */
      attach: boolean;
      attach_fullscreen: boolean;
      /** Name of the Twitch channel */
      name: string;
      // The following properties are only used on Windows
      winId: string;
      yOffset: number;
      size: {
        x: number;
        pixelRatio: number;
        width: number;
        height: number;
      };
    }
  | {
      action: 'detach';
      winId: number;
    };
```

[chatterino]: https://chatterino.com 'Chatterino 2'
[chrome-ext]: https://chrome.google.com/webstore/detail/chatterino-native-host/glknmaideaikkmemifbfkhnomoknepka 'Chatterino Native Host for Chrome'
[firefox-addon]: https://addons.mozilla.org/firefox/addon/chatterino-native-host/ 'Chatterino Native Host for Firefox'
[twitch]: https://twitch.tv 'Twitch.tv'
