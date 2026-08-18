import { z } from "zod";
import { RuntimeError } from "../../src/errors";
import {
  buildBlockerWaitArm,
  buildCliRowWaitArm,
  buildGeneralWaitArm,
  buildSettingsEntryProbe,
  evalValueSchema,
} from "./renderer-cdp-readiness";
import type { CdpTransport } from "./renderer-cdp-transport";

const pointSchema = z.object({ x: z.number(), y: z.number() });
const entrySchema = z.object({
  settings: pointSchema,
  blocker: pointSchema.nullable(),
  general: pointSchema.nullable(),
});
const toggleSchema = pointSchema.extend({ enabled: z.boolean() });
type Point = z.infer<typeof pointSchema>;

function remaining(deadline: number): number {
  const value = deadline - Date.now();
  if (value <= 0) throw new RuntimeError("documented CLI activation timed out");
  return value;
}

async function evaluate(cdp: CdpTransport, expression: string, deadline: number): Promise<unknown> {
  const parsed = evalValueSchema.parse(
    await cdp.request(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      remaining(deadline),
    ),
  );
  if (parsed.exceptionDetails !== undefined)
    throw new RuntimeError(`CDP evaluation failed: ${parsed.exceptionDetails.text}`);
  return parsed.result.value;
}

async function click(cdp: CdpTransport, point: Point, deadline: number): Promise<void> {
  for (const type of ["mousePressed", "mouseReleased"] as const)
    await cdp.request(
      "Input.dispatchMouseEvent",
      { type, x: point.x, y: point.y, button: "left", clickCount: 1 },
      remaining(deadline),
    );
}

async function navigate(
  cdp: CdpTransport,
  deadline: number,
): Promise<z.infer<typeof toggleSchema>> {
  let entry = entrySchema.parse(await evaluate(cdp, buildSettingsEntryProbe(), deadline));
  if (entry.blocker !== null) {
    await evaluate(cdp, buildBlockerWaitArm(), deadline);
    await click(cdp, entry.blocker, deadline);
    await evaluate(cdp, "window.__visualNoteBlockerWait", deadline);
    entry = entrySchema.parse(await evaluate(cdp, buildSettingsEntryProbe(), deadline));
  }
  let general = entry.general;
  if (general === null) {
    await evaluate(cdp, buildGeneralWaitArm(), deadline);
    await click(cdp, entry.settings, deadline);
    general = pointSchema.parse(await evaluate(cdp, "window.__visualNoteGeneralWait", deadline));
  }
  await evaluate(cdp, buildCliRowWaitArm(), deadline);
  await click(cdp, general, deadline);
  return toggleSchema.parse(await evaluate(cdp, "window.__visualNoteCliRowWait", deadline));
}

export async function activateDocumentedCli(cdp: CdpTransport, deadline: number): Promise<void> {
  const toggle = await navigate(cdp, deadline);
  if (toggle.enabled) return;
  await click(cdp, toggle, deadline);
  const registration = pointSchema.parse(
    await evaluate(
      cdp,
      `(async()=>{const find=()=>[...document.querySelectorAll('.modal,[role="dialog"]')].find(m=>/Set up CLI to work in the terminal/i.test(m.textContent||''));const modal=await new Promise((ok,bad)=>{const hit=find();if(hit)return ok(hit);const observer=new MutationObserver(()=>{const value=find();if(value){observer.disconnect();clearTimeout(timer);ok(value)}});observer.observe(document,{subtree:true,childList:true});const timer=setTimeout(()=>{observer.disconnect();bad(new Error('CLI registration dialog timeout'))},30000)});const button=[...modal.querySelectorAll('button')].find(b=>/^(Register|Enable CLI)$/i.test(b.textContent?.trim()||''));const rect=button.getBoundingClientRect();window.__visualNoteCliRegistration=new Promise((ok,bad)=>{const observer=new MutationObserver(()=>{if(!modal.isConnected){observer.disconnect();clearTimeout(timer);ok(true)}});observer.observe(document,{subtree:true,childList:true});const timer=setTimeout(()=>{observer.disconnect();bad(new Error('CLI registration completion timeout'))},30000)});return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`,
      deadline,
    ),
  );
  await click(cdp, registration, deadline);
  await evaluate(cdp, "window.__visualNoteCliRegistration", deadline);
}
