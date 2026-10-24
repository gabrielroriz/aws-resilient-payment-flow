# Diagrams

How to edit the project's diagrams. Workflow diagrams are Mermaid blocks inside the Markdown, which GitHub renders; edit them as text. Image diagrams, such as the architecture diagram in the README, are [draw.io](https://www.drawio.com) diagrams in the style of AWS architecture diagrams, edited as described here.

## Requirements

| Requirement | Used for |
|---|---|
| [draw.io](https://app.diagrams.net) in a browser, or the [Draw.io Integration extension for VS Code](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio) | Editing the image diagrams |

## Setup

1. In VS Code, install the extension the workspace recommends. The workspace settings in [`.vscode/settings.json`](../../.vscode/settings.json) make it save images in light mode, as the README shows them, whatever the editor's theme.
2. To add AWS services, open **More Shapes** and turn on the AWS library, titled with the current year, such as AWS 2026. It is the icon set the diagrams use.

## How it works

Each image diagram lives in `docs/architecture/images/` as a `.drawio.svg` file: an SVG image with the draw.io diagram embedded in its `content` attribute. GitHub shows it as an image, and draw.io opens it as an editable diagram.

Every image diagram shares one style, taken from the architecture diagram:

| Convention | Detail |
|---|---|
| Background | White, exported with the **Light** appearance, so it never turns dark |
| AWS resources | Service icons from the AWS library in their category colors, labeled with the resource name in bold, then the service and key settings, such as `webhook_events.fifo`, Amazon SQS FIFO, kept 4 days |
| Other parts | AWS General Resources icons in squid ink, such as a traditional server for payment providers |
| Typography | Helvetica: titles at 20 px, names in bold at 12 px in dark ink (`#232F3E`), and details at 11 px in gray (`#545B64`) |
| Groups | The AWS Cloud group around AWS resources, lanes filled light gray (`#EFF0F3`), and dashed rounded boxes in the related service's color around sets of items, such as the gateway adapters |
| Arrows | Dark ink at 1.5 px with open arrowheads, connected to the shapes they join, so they follow when a shape moves; dashed for safety nets and associations |
| Steps | Each arrow carries a numbered dark badge attached to it, explained by the step with the same number in a legend box with a light gray border |
| Containers | Groups and lanes hold their shapes, so moving one moves its contents |
| New elements | Copy an existing one, so the style matches |

The architecture diagram in the README adds its own rules:

| Convention | Detail |
|---|---|
| Scope | What is built, nothing planned; update the diagram when the architecture changes |
| Layout | One lane per stage inside the AWS Cloud group, receipt above processing, with shapes aligned on shared columns and rows |
| Labels | Above the icons in the receipt lane and below them in the processing lane, so arrows between the lanes never cross text |

## Usage

| Editor | Steps |
|---|---|
| VS Code | Open the file, which opens in the draw.io editor, edit it, and save |
| Browser | In draw.io, open the file with **File > Open from > Device**, edit it, then use **File > Export as > SVG** with **Include a copy of my diagram** on and **Appearance** set to **Light**, and save it over the original file |

An export without **Include a copy of my diagram** gives a plain picture that no longer opens as a diagram, and one with another appearance changes how the docs show it.

### Reading a diagram in code

Scripts and AI agents can read a diagram without draw.io. The `content` attribute of the root `<svg>` element holds the draw.io file as escaped XML. Its `<diagram>` element contains an `<mxGraphModel>` whose `mxCell` elements are the shapes, labels, and arrows; draw.io can also store that model compressed, as base64 text in place of the XML:

```js
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const file = unescape(svg.match(/<svg[^>]*\scontent="([^"]*)"/)[1]);
let model = file.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/)[1];
if (!model.trim().startsWith("<")) {
  model = decodeURIComponent(zlib.inflateRawSync(Buffer.from(model, "base64")).toString("utf8"));
}
```

The image and the embedded model are written together, so changing the `content` attribute alone leaves the picture stale. Save edits through draw.io, which regenerates both.
