# Diagrams

How to edit the project's diagrams. Workflow diagrams are Mermaid blocks inside the Markdown, which GitHub renders; edit them as text. The architecture diagram in the README is an [Excalidraw](https://excalidraw.com) drawing, edited as described here.

## Requirements

| Requirement | Used for |
|---|---|
| Excalidraw in a browser, or the [Excalidraw extension for VS Code](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor) | Editing the architecture diagram |

## Setup

1. In VS Code, install the extension the workspace recommends. The workspace settings in [`.vscode/settings.json`](../../.vscode/settings.json) make it save images in dark mode, as the README shows them; the extension's default is light mode.
2. To add AWS services, open the library panel, browse the libraries, and add AWS Serverless Icons v2, the icon set the diagram uses.

## How it works

The diagram lives in `docs/architecture/images/` as an `.excalidraw.svg` file: an SVG image with the Excalidraw scene embedded in its metadata. GitHub shows it as an image, and Excalidraw opens it as an editable drawing.

| Convention | Detail |
|---|---|
| Scope | What is built, nothing planned; update the diagram when the architecture changes |
| AWS resources | Icons from AWS Serverless Icons v2, labeled with the resource name, such as `webhook_entry_point` |
| Colors | Chosen in the light theme and inverted by the dark-mode export: green for notes and arrows, pink for queue settings |
| New labels and notes | Copy an existing one, so the font and color match |
| Arrows | Attached to the icons they connect, so they follow when an icon moves |

## Usage

| Editor | Steps |
|---|---|
| VS Code | Open the file, which opens in the Excalidraw editor, edit it, and save |
| Browser | In Excalidraw, open the file from the menu, edit it, then export it as an SVG image with **Background**, **Dark mode**, and **Embed scene** on, and save it over the original file |

An export without **Embed scene** gives a plain picture that no longer opens as a drawing, and one without **Dark mode** turns the README image light.

### Reading the scene in code

Scripts and AI agents can read the drawing without Excalidraw. The scene is the base64 text between `<!-- payload-start -->` and `<!-- payload-end -->`. Decoded as Latin-1, it is a JSON wrapper whose `encoded` field holds the zlib-compressed scene as a byte string:

```js
const payload = svg.match(/<!-- payload-start -->\s*([\s\S]*?)\s*<!-- payload-end -->/)[1];
const wrapper = JSON.parse(Buffer.from(payload, "base64").toString("latin1"));
const scene = JSON.parse(zlib.inflateSync(Buffer.from(wrapper.encoded, "latin1")).toString("utf8"));
```

Decoding as UTF-8 corrupts the compressed bytes. To write the file back, export the edited scene with Excalidraw's `exportToSvg`, turning on `exportEmbedScene` and `exportWithDarkMode`.
