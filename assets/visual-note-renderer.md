/*
Visual Note deterministic renderer.
Receives a parsed request from the CLI through globalThis.__visualNoteRenderRequest,
uses only the ExcalidrawAutomate workbench for drawing creation/edits, exports SVG,
and writes the deterministic companion files through the Obsidian vault API.
*/
const REQUEST_KEY = "__visualNoteRenderRequest";
const categoryPalette = {
  cloudflare: { stroke: "#e8590c", background: "#fff4e6" },
  aws: { stroke: "#b7791f", background: "#fff9db" },
  external: { stroke: "#495057", background: "#f1f3f5" },
  data: { stroke: "#1971c2", background: "#e7f5ff" },
  runtime: { stroke: "#7048e8", background: "#f3f0ff" },
  security: { stroke: "#2b8a3e", background: "#ebfbee" },
  risk: { stroke: "#c92a2a", background: "#fff5f5" },
  neutral: { stroke: "#475569", background: "#f8fafc" },
};

function visualPalette(planned) {
  if (planned.role === "title") return { stroke: "#1e293b", background: "transparent" };
  if (planned.role.startsWith("edge")) return { stroke: "#64748b", background: "transparent" };
  return categoryPalette[planned.customData.category] ?? categoryPalette.neutral;
}

/** Keep each generated shape/label pair reusable as one Excalidraw group. */
function groupIdFor(planned) {
  if (planned.role === "title") return [];
  return [`visual-note:${planned.customData.artifactId}:${planned.semanticId}`];
}

/** Return the validated request supplied by the typed CLI adapter. */
function readRequest() {
  const request = globalThis[REQUEST_KEY];
  delete globalThis[REQUEST_KEY];
  if (!request || request.schemaVersion !== 1 || !Array.isArray(request.plan?.elements)) {
    throw new TypeError("VISUAL_NOTE_RENDER_REQUEST_INVALID");
  }
  return request;
}

/** Apply deterministic geometry and style to an EA workbench element. */
function applyElement(element, planned) {
  const colors = visualPalette(planned);
  element.x = planned.x;
  element.y = planned.y;
  element.width = planned.width;
  element.height = planned.height;
  element.angle = 0;
  element.strokeColor = colors.stroke;
  element.backgroundColor = ["rectangle", "ellipse", "diamond"].includes(planned.type)
    ? colors.background
    : "transparent";
  element.fillStyle = "solid";
  element.strokeWidth = planned.role === "title" ? 1 : planned.role === "edge-line" ? 1.5 : 2;
  element.strokeStyle = planned.customData.status === "inference" ? "dashed" : "solid";
  element.roughness = planned.role === "edge-line" ? 1 : planned.role.startsWith("frame") ? 0 : 0.7;
  element.opacity = planned.role === "frame-shape" ? 32 : 100;
  element.groupIds = groupIdFor(planned);
  if (planned.type === "text") {
    element.text = planned.text;
    element.originalText = planned.text;
    element.rawText = planned.text;
    element.fontFamily = planned.role === "edge-label" ? 2 : 1;
    const longestLine = Math.max(...String(planned.text ?? "").split("\n").map((line) => Array.from(line).length));
    element.fontSize = planned.role === "title" ? 34 : planned.role === "frame-label" ? 24 : planned.role === "edge-label" ? 13 : longestLine > 30 ? 16 : longestLine > 24 ? 18 : 20;
    element.textAlign = planned.role === "frame-label" ? "left" : "center";
    element.verticalAlign = "middle";
    element.autoResize = false;
    element.containerId = null;
  }
  if (planned.type === "arrow") {
    element.points = planned.points.map((point) => [point[0], point[1]]);
    element.startArrowhead = null;
    element.endArrowhead = "arrow";
    element.startBinding = null;
    element.endBinding = null;
  }
}

/** Add a new deterministic element to the EA workbench. */
function addElement(planned) {
  if (planned.type === "rectangle") {
    ea.addRect(planned.x, planned.y, planned.width, planned.height, planned.id);
  } else if (planned.type === "ellipse") {
    ea.addEllipse(planned.x, planned.y, planned.width, planned.height, planned.id);
  } else if (planned.type === "diamond") {
    ea.addDiamond(planned.x, planned.y, planned.width, planned.height, planned.id);
  } else if (planned.type === "text") {
    ea.addText(
      planned.x,
      planned.y,
      planned.text,
      {
        autoResize: false,
        width: planned.width,
        height: planned.height,
        textAlign: "center",
        textVerticalAlign: "middle",
      },
      planned.id,
    );
  } else {
    const absolute = planned.points.map((point) => [point[0] + planned.x, point[1] + planned.y]);
    ea.addArrow(absolute, { startArrowHead: null, endArrowHead: "arrow" }, planned.id);
  }
  const element = ea.getElement(planned.id);
  if (!element) throw new TypeError(`VISUAL_NOTE_ELEMENT_CREATE_FAILED:${planned.id}`);
  applyElement(element, planned);
  ea.addAppendUpdateCustomData(planned.id, planned.customData);
}

/** Validate all scene identities before placing anything in the workbench. */
function validateScene(request, existing) {
  const expected = new Map(request.plan.elements.map((element) => [element.id, element]));
  for (const element of existing) {
    const metadata = element.customData;
    const planned = expected.get(element.id);
    if (planned && (!metadata || metadata.owner !== "agent" || metadata.artifactId !== request.plan.artifactId || metadata.semanticId !== planned.semanticId || metadata.elementRole !== planned.role)) {
      throw new TypeError(`VISUAL_NOTE_ID_COLLISION:${element.id}`);
    }
    if (metadata?.owner === "agent" && metadata.artifactId === request.plan.artifactId && !planned) {
      throw new TypeError(`VISUAL_NOTE_STALE_AGENT_ELEMENT:${element.id}`);
    }
  }
}

/** Create or update a non-drawing companion file. */
async function upsert(path, bytes) {
  const file = app.vault.getAbstractFileByPath(path);
  if (file) await app.vault.modify(file, bytes);
  else await app.vault.create(path, bytes);
}

/** Render the scene through the immutable EA workbench and return a machine receipt. */
async function render(request) {
  const existing = ea.targetView ? ea.getViewElements() : [];
  validateScene(request, existing);
  ea.clear();
  const existingById = new Map(existing.map((element) => [element.id, element]));
  for (const planned of request.plan.elements) {
    const sceneElement = existingById.get(planned.id);
    if (sceneElement) {
      ea.copyViewElementsToEAforEditing([sceneElement]);
      const editable = ea.getElement(planned.id);
      if (!editable) throw new TypeError(`VISUAL_NOTE_WORKBENCH_COPY_FAILED:${planned.id}`);
      applyElement(editable, planned);
      ea.addAppendUpdateCustomData(planned.id, planned.customData);
    } else {
      addElement(planned);
    }
  }
  const svg = await ea.createSVG(undefined, false, {
    withBackground: true,
    withTheme: true,
    isMask: false,
    skipInliningFonts: true,
  }, undefined, "light", 20);
  const svgBytes = new XMLSerializer().serializeToString(svg);
  let drawingPath = request.paths.drawing;
  if (ea.targetView) {
    const committed = await ea.addElementsToView(false, true);
    if (!committed) throw new TypeError("VISUAL_NOTE_EA_COMMIT_FAILED");
  } else {
    drawingPath = await ea.create({
      filename: `${request.plan.artifactId}.excalidraw.md`,
      foldername: request.paths.drawingFolder,
      onNewPane: false,
      silent: false,
      frontmatterKeys: { "excalidraw-plugin": "parsed" },
    });
  }
  if (drawingPath !== request.paths.drawing) throw new TypeError("VISUAL_NOTE_DRAWING_PATH_MISMATCH");
  await upsert(request.paths.svg, `${svgBytes}\n`);
  await upsert(request.paths.note, request.noteBytes);
  await upsert(request.paths.spec, request.specBytes);
  return {
    schemaVersion: 1,
    type: "VisualNoteScriptEngineRenderResult",
    drawingPath,
    svgPath: request.paths.svg,
    notePath: request.paths.note,
    specPath: request.paths.spec,
    elementCount: request.plan.elements.length,
    elementIds: request.plan.elements.map((element) => element.id),
  };
}

return await render(readRequest());
