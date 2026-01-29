# PER - Portable Execution Runtime

**Run your notebooks anywhere effortlessly**

PER is a VS Code extension that enables you to work with Notebooks accross various runtimes. Built on top of the [official Google Colab extension](https://marketplace.visualstudio.com/items?itemName=google.colab) and the [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter), PER provides enhanced multi-account management capabilities.

## Prerequisites

**Required Extensions:**
- [Official Google Colab Extension](https://marketplace.visualstudio.com/items?itemName=google.colab) - Required for authentication
- [Jupyter Extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) - Required for notebook support

## Quick Start

1. Install [VS Code](https://code.visualstudio.com)
2. Install the **Official Google Colab** extension from the marketplace
3. Install the **PER** extension
4. Sign in to your Google account through VS Code's account menu
5. Open or create a notebook file
6. Click `Select Kernel` > `PER` > `New Colab Server`
7. 😎 Enjoy!

## Features

- **Portable Execution**: Run your notebooks anywhere with ease
- **Seamless Integration**: Built on top of official Colab and Jupyter extensions
- **Enhanced Server Management**: Better control over your Colab servers

## Commands

Activate the command palette with `Ctrl+Shift+P` or `Cmd+Shift+P` on Mac.

| Command                         | Description                                |
| ------------------------------- | ------------------------------------------ |
| `PER: Remove Server`            | Select an assigned Colab server to remove  |
| `PER: Mount Server to Workspace`| Mount a Colab server's filesystem          |
| `PER: Upload to PER`            | Upload files to a Colab server             |
| `PER: Sign Out`                 | Sign out of your account                   |

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

Apache-2.0 License

## Acknowledgments

This extension builds upon the excellent work of the [Google Colab VS Code Extension](https://github.com/googlecolab/colab-vscode).
