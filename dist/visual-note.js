#!/usr/bin/env bun
// @bun

// src/cli.ts
import { readFileSync as readFileSync15 } from "fs";

// node_modules/zod/v4/core/core.js
var _a;
function $constructor(name, initializer, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: new Set
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0;i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a;
    const inst = params?.Parent ? new Definition : this;
    init(inst, def);
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $brand = Symbol("zod_brand");

class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error, path = []) => {
    for (const issue of error.issues) {
      if (issue.code === "invalid_union" && issue.errors.length) {
        issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
      } else if (issue.code === "invalid_key") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else if (issue.code === "invalid_element") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else {
        const fullpath = [...path, ...issue.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
// node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst) => {
    var _a;
    (_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst) => {
    const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst) => {
    const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join(`
`));
  }
}

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 4,
  patch: 3
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary) => {
            return handleCanaryResult(canary, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result) => runChecks(result, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error;
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error;
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error;
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error;
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0;i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result) => handleArrayResult(result, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = new Set);
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results) => {
      return handleUnionResults(results, payload, inst, ctx);
    });
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left, right]) => {
        return handleIntersectionResults(payload, left, right);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    const optinStart = getTupleOptStart(items, "optin");
    const optoutStart = getTupleOptStart(items, "optout");
    if (!def.rest) {
      if (input.length < optinStart) {
        payload.issues.push({
          code: "too_small",
          minimum: optinStart,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
      if (input.length > items.length) {
        payload.issues.push({
          code: "too_big",
          maximum: items.length,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
      }
    }
    const itemResults = new Array(items.length);
    for (let i = 0;i < items.length; i++) {
      const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((rr) => {
          itemResults[i] = rr;
        }));
      } else {
        itemResults[i] = r;
      }
    }
    if (def.rest) {
      let i = items.length - 1;
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((r) => handleTupleResult(r, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
    }
    return handleTupleResults(itemResults, payload, items, input, optoutStart);
  };
});
function getTupleOptStart(items, key) {
  for (let i = items.length - 1;i >= 0; i--) {
    if (items[i]._zod[key] !== "optional")
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0;i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1;i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === undefined) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = new Set;
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result) => {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[outKey] = result.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result) => {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[keyResult.value] = result.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output) => {
        payload.value = output;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === undefined && (result.issues.length || result.fallback)) {
    return { issues: [], value: undefined };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === undefined) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleDefaultResult(result, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleNonOptionalResult(result, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => {
        payload.value = result.value;
        if (result.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right) => handlePipeResult(right, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left) => handlePipeResult(left, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r) => handleRefineResult(r, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// node_modules/zod/v4/locales/en.js
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue) => {
    switch (issue.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue.expected] ?? issue.expected;
        const receivedType = parsedType(issue.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
      case "too_big": {
        const adj = issue.inclusive ? "<=" : "<";
        const sizing = getSizing(issue.origin);
        if (sizing)
          return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue.inclusive ? ">=" : ">";
        const sizing = getSizing(issue.origin);
        if (sizing) {
          return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue.origin}`;
      case "invalid_union":
        if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) {
          const opts = issue.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error()
  };
}
// node_modules/zod/v4/core/registries.js
var _a2;
var $output = Symbol("ZodOutput");
var $input = Symbol("ZodInput");

class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// node_modules/zod/v4/core/api.js
function _string(Class, params) {
  return new Class({
    type: "string",
    ...normalizeParams(params)
  });
}
function _email(Class, params) {
  return new Class({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class, params) {
  return new Class({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class, params) {
  return new Class({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class, params) {
  return new Class({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class, params) {
  return new Class({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class, params) {
  return new Class({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class, params) {
  return new Class({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class, params) {
  return new Class({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class, params) {
  return new Class({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class, params) {
  return new Class({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class, params) {
  return new Class({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class, params) {
  return new Class({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class, params) {
  return new Class({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class, params) {
  return new Class({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class, params) {
  return new Class({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class, params) {
  return new Class({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class, params) {
  return new Class({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class, params) {
  return new Class({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class, params) {
  return new Class({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class, params) {
  return new Class({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class, params) {
  return new Class({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class, element, params) {
  return new Class({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? undefined
  };
}
function process2(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process2(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    Object.assign(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a = result.schema).default ?? (_a.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id) => id);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema = seen.schema;
    for (const key in schema) {
      delete schema[key];
    }
    schema.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema = seen.def ?? seen.schema;
    const _cached = { ...schema };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema.allOf = schema.allOf ?? [];
        schema.allOf.push(refSchema);
      } else {
        Object.assign(schema, refSchema);
      }
      Object.assign(schema, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
// node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time") {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1)
      json.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json.allOf = [
        ...regexes.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json.type = "integer";
  else
    json.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (typeof multipleOf === "number")
    json.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var bigintProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("BigInt cannot be represented in JSON Schema");
  }
};
var symbolProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Symbols cannot be represented in JSON Schema");
  }
};
var nullProcessor = (_schema, ctx, json, _params) => {
  if (ctx.target === "openapi-3.0") {
    json.type = "string";
    json.nullable = true;
    json.enum = [null];
  } else {
    json.type = "null";
  }
};
var undefinedProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Undefined cannot be represented in JSON Schema");
  }
};
var voidProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Void cannot be represented in JSON Schema");
  }
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var anyProcessor = (_schema, _ctx, _json, _params) => {};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var dateProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Date cannot be represented in JSON Schema");
  }
};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === undefined) {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Literal `undefined` cannot be represented in JSON Schema");
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {} else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json.type = "boolean";
    if (vals.every((v) => v === null))
      json.type = "null";
    json.enum = vals;
  }
};
var nanProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("NaN cannot be represented in JSON Schema");
  }
};
var templateLiteralProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  const pattern = schema._zod.pattern;
  if (!pattern)
    throw new Error("Pattern not found in template literal");
  _json.type = "string";
  _json.pattern = pattern.source;
};
var fileProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  const file = {
    type: "string",
    format: "binary",
    contentEncoding: "binary"
  };
  const { minimum, maximum, mime } = schema._zod.bag;
  if (minimum !== undefined)
    file.minLength = minimum;
  if (maximum !== undefined)
    file.maxLength = maximum;
  if (mime) {
    if (mime.length === 1) {
      file.contentMediaType = mime[0];
      Object.assign(_json, file);
    } else {
      Object.assign(_json, file);
      _json.anyOf = mime.map((m) => ({ contentMediaType: m }));
    }
  } else {
    Object.assign(_json, file);
  }
};
var successProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
var functionProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Function types cannot be represented in JSON Schema");
  }
};
var transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
var mapProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Map cannot be represented in JSON Schema");
  }
};
var setProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Set cannot be represented in JSON Schema");
  }
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = process2(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  json.properties = {};
  const shape = def.shape;
  for (const key in shape) {
    json.properties[key] = process2(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const v = def.shape[key]._zod;
    if (ctx.io === "input") {
      return v.optin === undefined;
    } else {
      return v.optout === undefined;
    }
  }));
  if (requiredKeys.size > 0) {
    json.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = process2(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => process2(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = process2(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = process2(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => process2(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? process2(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  if (ctx.target === "draft-2020-12") {
    json.prefixItems = prefixItems;
    if (rest) {
      json.items = rest;
    }
  } else if (ctx.target === "openapi-3.0") {
    json.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json.items.anyOf.push(rest);
    }
    json.minItems = prefixItems.length;
    if (!rest) {
      json.maxItems = prefixItems.length;
    }
  } else {
    json.items = prefixItems;
    if (rest) {
      json.additionalItems = rest;
    }
  }
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
};
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = process2(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      json.patternProperties[pattern.source] = valueSchema;
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = process2(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
    }
    json.additionalProperties = process2(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  if (keyValues) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json.required = validKeyValues;
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process2(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var promiseProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  process2(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var allProcessors = {
  string: stringProcessor,
  number: numberProcessor,
  boolean: booleanProcessor,
  bigint: bigintProcessor,
  symbol: symbolProcessor,
  null: nullProcessor,
  undefined: undefinedProcessor,
  void: voidProcessor,
  never: neverProcessor,
  any: anyProcessor,
  unknown: unknownProcessor,
  date: dateProcessor,
  enum: enumProcessor,
  literal: literalProcessor,
  nan: nanProcessor,
  template_literal: templateLiteralProcessor,
  file: fileProcessor,
  success: successProcessor,
  custom: customProcessor,
  function: functionProcessor,
  transform: transformProcessor,
  map: mapProcessor,
  set: setProcessor,
  array: arrayProcessor,
  object: objectProcessor,
  union: unionProcessor,
  intersection: intersectionProcessor,
  tuple: tupleProcessor,
  record: recordProcessor,
  nullable: nullableProcessor,
  nonoptional: nonoptionalProcessor,
  default: defaultProcessor,
  prefault: prefaultProcessor,
  catch: catchProcessor,
  pipe: pipeProcessor,
  readonly: readonlyProcessor,
  promise: promiseProcessor,
  optional: optionalProcessor,
  lazy: lazyProcessor
};
function toJSONSchema(input, params) {
  if ("_idmap" in input) {
    const registry = input;
    const ctx = initializeContext({ ...params, processors: allProcessors });
    const defs = {};
    for (const entry of registry._idmap.entries()) {
      const [_, schema] = entry;
      process2(schema, ctx);
    }
    const schemas = {};
    const external = {
      registry,
      uri: params?.uri,
      defs
    };
    ctx.external = external;
    for (const entry of registry._idmap.entries()) {
      const [key, schema] = entry;
      extractDefs(ctx, schema);
      schemas[key] = finalize(ctx, schema);
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const ctx = initializeContext({ ...params, processors: allProcessors });
  process2(input, ctx);
  extractDefs(ctx, input);
  return finalize(ctx, input);
}
// node_modules/zod/v4/classic/iso.js
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
    },
    addIssue: {
      value: (issue) => {
        inst.issues.push(issue);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    addIssues: {
      value: (issues) => {
        inst.issues.push(...issues);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
    }
  });
};
var ZodError = /* @__PURE__ */ $constructor("ZodError", initializer2);
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse3 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap;
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = new Set;
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse3(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode(inst, data, params);
  inst.decode = (data, params) => decode(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def = this.def;
      return this.clone(mergeDefs(def, {
        checks: [
          ...def.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def, params) {
      return clone(this, def, params);
    },
    brand() {
      return this;
    },
    register(reg, meta) {
      reg.add(this, meta);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(undefined).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  });
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: undefined });
    },
    extend(incoming) {
      return extend(this, incoming);
    },
    safeExtend(incoming) {
      return safeExtend(this, incoming);
    },
    merge(other) {
      return merge(this, other);
    },
    pick(mask) {
      return pick(this, mask);
    },
    omit(mask) {
      return omit(this, mask);
    },
    partial(...args) {
      return partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return required(ZodNonOptional, this, args[0]);
    }
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodObject(def);
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: unknown(),
    ...normalizeParams(params)
  });
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output) => {
        payload.value = output;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
// node_modules/zod/v4/classic/external.js
config(en_default());
// src/errors.ts
class InputError extends Error {
  detail;
  name = "InputError";
  constructor(detail, options) {
    super(detail, options);
    this.detail = detail;
  }
}

class CollisionError extends Error {
  path;
  name = "CollisionError";
  constructor(path, options) {
    super(`refusing dirty target collision: ${path}`, options);
    this.path = path;
  }
}

class ConflictError extends Error {
  detail;
  name = "ConflictError";
  constructor(detail, options) {
    super(detail, options);
    this.detail = detail;
  }
}

class RuntimeError extends Error {
  detail;
  name = "RuntimeError";
  constructor(detail, options) {
    super(detail, options);
    this.detail = detail;
  }
}

// src/arguments.ts
function parseOptions(argv, allowed, booleanFlags = new Set) {
  const values = new Map;
  const flags = new Set;
  let json = false;
  for (let index = 0;index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") {
      if (json)
        throw new InputError("--json may be supplied once");
      json = true;
      continue;
    }
    if (flag === undefined || !flag.startsWith("--") || !allowed.has(flag)) {
      throw new InputError(`unknown option: ${flag ?? "<missing>"}`);
    }
    if (booleanFlags.has(flag)) {
      if (flags.has(flag))
        throw new InputError(`${flag} may be supplied once`);
      flags.add(flag);
      continue;
    }
    if (values.has(flag))
      throw new InputError(`${flag} may be supplied once`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new InputError(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  return { values, flags, json };
}
function required2(options, flag) {
  const value = options.values.get(flag);
  if (value === undefined)
    throw new InputError(`${flag} is required`);
  return value;
}
function optional2(options, flag) {
  return options.values.get(flag);
}

// src/io.ts
import { createHash } from "crypto";
import { readFileSync } from "fs";
function readJson(path) {
  let bytes;
  try {
    bytes = readFileSync(path, "utf8");
  } catch (error) {
    throw new InputError(`cannot read JSON input: ${path}`, { cause: error });
  }
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new InputError(`malformed JSON input: ${path}`, { cause: error });
  }
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function formatResult(value, json) {
  return json ? `${JSON.stringify(value)}
` : `OK ${JSON.stringify(value)}
`;
}
function writeResult(value, json) {
  process.stdout.write(formatResult(value, json));
}

// src/operations.ts
import { existsSync as existsSync8 } from "fs";

// src/bootstrap.ts
import { mkdirSync as mkdirSync6, mkdtempSync, rmSync as rmSync4, writeFileSync as writeFileSync5 } from "fs";
import { tmpdir } from "os";
import { join as join10 } from "path";

// src/bootstrap-current.ts
import { existsSync as existsSync2, lstatSync } from "fs";
import { join as join2 } from "path";

// src/evidence-resolver.ts
import { existsSync, readFileSync as readFileSync2 } from "fs";
import { join } from "path";
function linesFor(path) {
  return readFileSync2(path, "utf8").replace(/\r\n/g, `
`).split(`
`);
}
function validateLineRange(reference, absolutePath) {
  if (reference.lineStart === undefined)
    return;
  const lines = linesFor(absolutePath);
  const lineEnd = reference.lineEnd ?? reference.lineStart;
  if (reference.lineStart > lines.length || lineEnd > lines.length) {
    throw new InputError(`evidence line is outside fixture file: ${reference.path}`);
  }
  const selected = lines.slice(reference.lineStart - 1, lineEnd);
  if (selected.every((line) => line.trim().length === 0)) {
    throw new InputError(`evidence line range is blank: ${reference.path}`);
  }
}
function validateSymbol(reference, absolutePath) {
  if (reference.symbol === undefined)
    return;
  const contents = readFileSync2(absolutePath, "utf8");
  if (!contents.includes(reference.symbol)) {
    throw new InputError(`evidence symbol is absent: ${reference.path}#${reference.symbol}`);
  }
}
function resolveEvidence(repositoryRoot, references) {
  return references.map((reference) => {
    const absolutePath = join(repositoryRoot, reference.path);
    if (!existsSync(absolutePath)) {
      throw new InputError(`evidence path is absent: ${reference.path}`);
    }
    validateLineRange(reference, absolutePath);
    validateSymbol(reference, absolutePath);
    return {
      path: reference.path,
      lineStart: reference.lineStart ?? null,
      lineEnd: reference.lineEnd ?? null,
      symbol: reference.symbol ?? null,
      resolved: true
    };
  });
}

// src/schema.ts
import { isAbsolute, normalize } from "path";
var semanticId = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).brand("SemanticId");
var artifactId = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).brand("ArtifactId");
var evidencePath = string2().min(1).refine((value) => !isAbsolute(value) && normalize(value) === value && !value.split("/").some((part) => part === "" || part === "." || part === ".."), "evidence path must be normalized and repository-relative");
var sourceRoot = string2().refine((value) => isAbsolute(value) && normalize(value) === value, "source root must be a normalized absolute path");
var hostedSourceRoot = string2().min(1).refine((value) => !isAbsolute(value) && !/^(?:[~\\/]|[A-Za-z]:)/.test(value), "hosted source root must not be an absolute or home-relative path");
var visualCategorySchema = _enum([
  "cloudflare",
  "aws",
  "external",
  "data",
  "runtime",
  "security",
  "risk",
  "neutral"
]);
var frameIdSchema = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
var nodeVisualSchema = object({
  category: visualCategorySchema.optional(),
  frameId: frameIdSchema.optional(),
  shape: _enum(["rectangle", "ellipse", "diamond"]).optional(),
  emphasis: _enum(["primary", "secondary", "muted"]).optional(),
  lane: _enum(["main", "exception", "upstream", "downstream"]).optional(),
  order: number2().int().nonnegative().optional()
}).strict();
var presentationSchema = object({
  layout: _enum(["layered", "frames", "timeline", "hub", "trust-boundary", "components"]),
  direction: literal("left-to-right").default("left-to-right"),
  columns: number2().int().min(1).max(3).optional(),
  frames: array(object({
    id: frameIdSchema,
    label: string2().trim().min(1),
    category: visualCategorySchema,
    order: number2().int().nonnegative()
  }).strict()).default([])
}).strict();
var evidenceReferenceSchema = object({
  path: evidencePath,
  lineStart: number2().int().positive().optional(),
  lineEnd: number2().int().positive().optional(),
  symbol: string2().min(1).optional()
}).strict().superRefine((reference, context) => {
  if (reference.lineEnd !== undefined && reference.lineStart === undefined) {
    context.addIssue({ code: "custom", message: "lineEnd requires lineStart" });
  }
  if (reference.lineStart !== undefined && reference.lineEnd !== undefined && reference.lineEnd < reference.lineStart) {
    context.addIssue({ code: "custom", message: "lineEnd must not precede lineStart" });
  }
});
var knowledgeStatusSchema = _enum(["fact", "inference", "question"]);
var visualKindValues = [
  "project-map",
  "system-architecture",
  "container-architecture",
  "component-architecture",
  "adr",
  "api-contract",
  "workflow",
  "data-flow",
  "trust-boundary",
  "code-exploration"
];
var claimFields = {
  semanticId,
  label: string2().trim().min(1),
  status: knowledgeStatusSchema,
  evidence: array(evidenceReferenceSchema)
};
var visualNodeSchema = object({ ...claimFields, visual: nodeVisualSchema.optional() }).strict();
var edgeRelationValues = [
  "runtime-call",
  "data-movement",
  "state-transition",
  "static-reference"
];
var visualEdgeSchema = object({
  ...claimFields,
  from: semanticId,
  to: semanticId,
  relation: _enum(edgeRelationValues).optional()
}).strict();
var learningText = string2().trim().min(1);
var learningSchema = object({
  question: learningText,
  answer: learningText,
  route: array(object({ semanticId, explanation: learningText }).strict()).default([]),
  glossary: array(object({ term: learningText, meaning: learningText }).strict()).default([]),
  scope: object({
    covers: array(learningText).default([]),
    omits: array(learningText).default([])
  }).strict().optional(),
  verify: array(object({ semanticId, how: learningText, command: learningText.optional() }).strict()).default([]),
  checks: array(object({ prompt: learningText, answer: learningText }).strict()).default([]),
  analogies: array(object({
    analogy: learningText,
    holds: array(learningText).min(1),
    breaks: array(learningText).min(1)
  }).strict()).default([])
}).strict();
function specSchemaWithRoot(root) {
  return object({
    schemaVersion: literal(1),
    artifactId,
    kind: _enum(visualKindValues),
    revision: number2().int().positive(),
    title: string2().trim().min(1),
    source: object({
      root,
      commit: string2().regex(/^[0-9a-f]{7,64}$/).nullable()
    }).strict(),
    presentation: presentationSchema.optional(),
    learning: learningSchema.optional(),
    nodes: array(visualNodeSchema).min(1),
    edges: array(visualEdgeSchema)
  }).strict().superRefine((spec, context) => {
    const allIds = [
      ...spec.nodes.map((node) => node.semanticId),
      ...spec.edges.map((edge) => edge.semanticId)
    ];
    if (new Set(allIds).size !== allIds.length)
      context.addIssue({ code: "custom", message: "semantic IDs must be unique" });
    const nodeIds = new Set(spec.nodes.map((node) => node.semanticId));
    for (const edge of spec.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
        context.addIssue({
          code: "custom",
          message: `edge ${edge.semanticId} has a dangling endpoint`
        });
    }
    for (const claim of [...spec.nodes, ...spec.edges]) {
      if (claim.status === "fact" && claim.evidence.length === 0)
        context.addIssue({
          code: "custom",
          message: `fact ${claim.semanticId} requires evidence`
        });
    }
    const frames = spec.presentation?.frames ?? [];
    if (new Set(frames.map((frame) => frame.id)).size !== frames.length)
      context.addIssue({ code: "custom", message: "presentation frame IDs must be unique" });
    const frameIds = new Set(frames.map((frame) => frame.id));
    for (const node of spec.nodes) {
      if (node.visual?.frameId !== undefined && !frameIds.has(node.visual.frameId))
        context.addIssue({
          code: "custom",
          message: `node ${node.semanticId} references an unknown presentation frame`
        });
    }
    const learning = spec.learning;
    if (learning === undefined)
      return;
    const claimIds = new Set(allIds);
    const routeIds = learning.route.map((step) => step.semanticId);
    if (new Set(routeIds).size !== routeIds.length)
      context.addIssue({
        code: "custom",
        message: "learning route must not repeat a semantic ID"
      });
    for (const id of [...routeIds, ...learning.verify.map((step) => step.semanticId)]) {
      if (!claimIds.has(id))
        context.addIssue({
          code: "custom",
          message: `learning references unknown semantic ID ${id}`
        });
    }
    const terms = learning.glossary.map((entry) => entry.term);
    if (new Set(terms).size !== terms.length)
      context.addIssue({ code: "custom", message: "learning glossary terms must be unique" });
  });
}
var visualNoteSpecSchema = specSchemaWithRoot(sourceRoot);
var hostedVisualNoteSpecSchema = specSchemaWithRoot(hostedSourceRoot);
function parseVisualNoteSpec(input) {
  return visualNoteSpecSchema.parse(input);
}

// src/template-style.ts
var palettes = {
  fact: { fill: "#dcfce7", stroke: "#15803d", text: "#14532d", badge: "FACT" },
  inference: {
    fill: "#fef3c7",
    stroke: "#b45309",
    text: "#78350f",
    badge: "INFERENCE"
  },
  question: { fill: "#ede9fe", stroke: "#6d28d9", text: "#4c1d95", badge: "QUESTION" }
};
function styleForClaim(semanticId, status, confidence) {
  const base = palettes[status];
  return {
    semanticId,
    status,
    confidence,
    className: `${status}-${confidence}`,
    fill: base.fill,
    stroke: base.stroke,
    text: base.text,
    dashArray: confidence === "high" ? null : confidence === "medium" ? "8 4" : "4 4",
    badge: confidence === "unknown" ? `${base.badge}-UNKNOWN` : `${base.badge}-${confidence.toUpperCase()}`
  };
}

// src/template-generate.ts
var DEFAULT_CORE_SIZE = 4;
function labelForClaim(claim) {
  return `${claim.identifier}
${claim.explanationKo}`;
}
function titleForView(artifact, suffix) {
  return `${artifact.titleKo} (${artifact.titleEn})${suffix === null ? "" : ` - ${suffix}`}`;
}
function chunk(values, size) {
  const chunks = [];
  for (let index = 0;index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
function orderedNodeIds(artifact) {
  return [...artifact.nodes].sort((left, right) => left.semanticId.localeCompare(right.semanticId)).map((node) => node.semanticId);
}
function buildStyles(nodes, edges) {
  return [...nodes, ...edges].map((claim) => styleForClaim(claim.semanticId, claim.status, claim.confidence)).sort((left, right) => left.semanticId.localeCompare(right.semanticId));
}
function buildSpec(artifact, repositoryRoot, artifactId, title, nodes, edges) {
  for (const claim of [...nodes, ...edges]) {
    if (claim.status === "fact")
      resolveEvidence(repositoryRoot, claim.evidence);
  }
  return parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId,
    kind: artifact.kind,
    revision: 1,
    title,
    source: { root: repositoryRoot, commit: null },
    presentation: artifact.presentation,
    nodes: nodes.map((node) => ({
      semanticId: node.semanticId,
      label: labelForClaim(node),
      status: node.status,
      evidence: node.evidence,
      visual: node.visual
    })),
    edges: edges.map((edge) => ({
      semanticId: edge.semanticId,
      from: edge.from,
      to: edge.to,
      label: labelForClaim(edge),
      status: edge.status,
      evidence: edge.evidence
    }))
  });
}
function viewsForArtifact(artifact, repositoryRoot) {
  const nodeById = new Map(artifact.nodes.map((node) => [node.semanticId, node]));
  const ordered = orderedNodeIds(artifact);
  const maxViewNodes = artifact.maxViewNodes;
  const coreSize = Math.min(DEFAULT_CORE_SIZE, maxViewNodes - 1);
  const cores = ordered.length <= maxViewNodes ? [ordered] : chunk(ordered, coreSize);
  const partial = cores.map((coreIds, index) => {
    const core = new Set(coreIds);
    const includedEdges = artifact.edges.filter((edge) => core.has(edge.from) || core.has(edge.to));
    const nodeIds = new Set(coreIds);
    for (const edge of includedEdges) {
      nodeIds.add(edge.from);
      nodeIds.add(edge.to);
    }
    if (nodeIds.size > maxViewNodes) {
      throw new InputError(`dense split exceeds max view size for ${artifact.artifactId} view ${index + 1}`);
    }
    const nodes = [...nodeIds].sort((left, right) => left.localeCompare(right)).map((semanticId) => {
      const node = nodeById.get(semanticId);
      if (node === undefined)
        throw new TypeError(`missing template node: ${semanticId}`);
      return node;
    });
    const viewId = cores.length === 1 ? artifact.artifactId : `${artifact.artifactId}-view-${String(index + 1).padStart(2, "0")}`;
    return {
      viewId,
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      title: titleForView(artifact, cores.length === 1 ? null : `\uBD84\uD560 ${index + 1}`),
      spec: buildSpec(artifact, repositoryRoot, viewId, titleForView(artifact, cores.length === 1 ? null : `\uBD84\uD560 ${index + 1}`), nodes, includedEdges),
      relatedViewIds: [],
      styles: buildStyles(nodes, includedEdges),
      split: {
        coreNodeIds: [...coreIds],
        duplicateNodeIds: nodes.map((node) => node.semanticId).filter((semanticId) => !core.has(semanticId)),
        edgeIds: includedEdges.map((edge) => edge.semanticId).sort()
      }
    };
  });
  return partial.map((view) => ({
    ...view,
    relatedViewIds: partial.filter((candidate) => candidate.viewId !== view.viewId && candidate.spec.nodes.some((node) => view.spec.nodes.some((current) => current.semanticId === node.semanticId))).map((candidate) => candidate.viewId).sort()
  }));
}
function validateCoverage(bundle, views) {
  const nodeIds = new Set(views.flatMap((view) => view.split.coreNodeIds));
  const edgeIds = new Set(views.flatMap((view) => view.split.edgeIds));
  const expectedNodes = bundle.artifacts.flatMap((artifact) => artifact.nodes.map((node) => node.semanticId));
  const expectedEdges = bundle.artifacts.flatMap((artifact) => artifact.edges.map((edge) => edge.semanticId));
  if (expectedNodes.some((semanticId) => !nodeIds.has(semanticId))) {
    throw new InputError(`split lost node coverage in ${bundle.bundleId}`);
  }
  if (expectedEdges.some((semanticId) => !edgeIds.has(semanticId))) {
    throw new InputError(`split lost edge coverage in ${bundle.bundleId}`);
  }
  return {
    nodeIds: [...nodeIds].sort(),
    edgeIds: [...edgeIds].sort(),
    complete: true
  };
}
function generateTemplateBundle(bundle, repositoryRoot) {
  const views = bundle.artifacts.flatMap((artifact) => viewsForArtifact(artifact, repositoryRoot));
  return {
    bundleId: bundle.bundleId,
    project: bundle.project,
    repositoryRoot,
    views,
    coverage: validateCoverage(bundle, views)
  };
}

// src/template-schema.ts
var semanticId2 = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).brand("SemanticId");
var confidenceSchema = _enum(["high", "medium", "low", "unknown"]);
var relativeDirectory = string2().min(1).refine((value) => !value.startsWith("/") && !value.split("/").some((part) => part === "" || part === "." || part === ".."), "repositoryRoot must be a clean fixture-relative directory");
var templateClaimFields = {
  semanticId: semanticId2,
  identifier: string2().trim().min(1),
  explanationKo: string2().trim().min(1),
  status: knowledgeStatusSchema,
  confidence: confidenceSchema,
  evidence: array(evidenceReferenceSchema)
};
var templateNodeSchema = object({ ...templateClaimFields, visual: nodeVisualSchema.optional() }).strict();
var templateEdgeSchema = object({
  ...templateClaimFields,
  from: semanticId2,
  to: semanticId2
}).strict();
var templateArtifactSchema = object({
  artifactId: string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: _enum(visualKindValues),
  titleKo: string2().trim().min(1),
  titleEn: string2().trim().min(1),
  maxViewNodes: number2().int().min(3).max(8).default(6),
  presentation: presentationSchema.optional(),
  nodes: array(templateNodeSchema).min(1),
  edges: array(templateEdgeSchema)
}).strict().superRefine((artifact, context) => {
  const ids = [
    ...artifact.nodes.map((node) => node.semanticId),
    ...artifact.edges.map((edge) => edge.semanticId)
  ];
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: `duplicate semantic IDs in ${artifact.artifactId}`
    });
  }
  const nodeIds = new Set(artifact.nodes.map((node) => node.semanticId));
  for (const edge of artifact.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      context.addIssue({
        code: "custom",
        message: `dangling template edge ${edge.semanticId} in ${artifact.artifactId}`
      });
    }
  }
  const frameIds = new Set((artifact.presentation?.frames ?? []).map((frame) => frame.id));
  for (const node of artifact.nodes) {
    if (node.visual?.frameId !== undefined && !frameIds.has(node.visual.frameId)) {
      context.addIssue({
        code: "custom",
        message: `node ${node.semanticId} references an unknown frame in ${artifact.artifactId}`
      });
    }
  }
});
var templateBundleSchema = object({
  schemaVersion: literal(1),
  bundleId: string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  project: string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  repositoryRoot: relativeDirectory,
  artifacts: array(templateArtifactSchema).min(1)
}).strict();
function parseTemplateBundle(input) {
  return templateBundleSchema.parse(input);
}

// src/bootstrap-current.ts
var bootstrapReceiptPrefix = "bootstrap:";
function hasExpectedBootstrapRevision(projectRoot, artifactId) {
  const metadataPath = join2(projectRoot, "_history", artifactId, "revisions", "cas-0", "metadata.json");
  if (!existsSync2(metadataPath))
    return false;
  const metadata = readJson(metadataPath);
  return metadata.sourceReceipt?.inode?.startsWith(bootstrapReceiptPrefix) === true && metadata.sourceReceipt?.generation?.startsWith(bootstrapReceiptPrefix) === true;
}
function currentProjectState(input) {
  const projectRoot = join2(input.root, "Engineering Atlas/10 Projects", input.project);
  if (!existsSync2(projectRoot))
    return null;
  const status = lstatSync(projectRoot);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new InputError(`dirty target collision: ${projectRoot}`);
  }
  const sourceJson = join2(projectRoot, "_generated/specs/source.json");
  if (!existsSync2(sourceJson))
    throw new InputError(`dirty target collision: ${projectRoot}`);
  const observed = readJson(sourceJson);
  if (observed.source?.root !== input.metadata.root || observed.source?.commit !== input.metadata.commit) {
    throw new InputError(`dirty target collision: ${projectRoot}`);
  }
  for (const asset of [
    "walkthrough-create.json",
    "walkthrough-extend.json",
    "walkthrough-refresh-v2.json"
  ]) {
    if (!existsSync2(join2(projectRoot, "_assets", asset))) {
      throw new InputError(`dirty target collision: ${projectRoot}`);
    }
  }
  if (input.bundlePath === undefined)
    return { status: "ALREADY_CURRENT", artifactCount: 0 };
  const bundle = parseTemplateBundle(readJson(input.bundlePath));
  const generated = generateTemplateBundle(bundle, input.metadata.root);
  for (const view of generated.views) {
    const specPath = join2(projectRoot, "_generated/specs", `${view.spec.artifactId}.json`);
    if (!existsSync2(specPath) || existsSync2(join2(projectRoot, "_history", view.spec.artifactId, ".rwlock")) || !hasExpectedBootstrapRevision(projectRoot, view.spec.artifactId)) {
      return null;
    }
  }
  return { status: "ALREADY_CURRENT", artifactCount: generated.views.length };
}

// src/bootstrap-notes.ts
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join as join3 } from "path";

// src/artifact-files.ts
function artifactPaths(project, artifactId) {
  const base = `Engineering Atlas/10 Projects/${project}`;
  const drawingFolder = `${base}/_generated/drawings`;
  return {
    base,
    drawingFolder,
    drawing: `${drawingFolder}/${artifactId}.excalidraw.md`,
    svg: `${drawingFolder}/${artifactId}.svg`,
    note: `${base}/01 Architecture/${artifactId}.md`,
    spec: `${base}/_generated/specs/${artifactId}.json`
  };
}
function noteBytes(spec, drawing, svg, deprecatedAnchors = []) {
  const claims = [...spec.nodes, ...spec.edges].map((claim) => {
    const evidence = claim.evidence.map((reference) => {
      const lines = reference.lineStart === undefined ? "" : `:${reference.lineStart}${reference.lineEnd === undefined ? "" : `-${reference.lineEnd}`}`;
      const symbol = reference.symbol === undefined ? "" : `#${reference.symbol}`;
      return `\`${reference.path}${lines}${symbol}\``;
    }).join(", ");
    return `- \`${claim.semanticId}\` **${claim.status}** - ${claim.label}${evidence.length === 0 ? "" : ` - ${evidence}`}`;
  }).join(`
`);
  const anchors = deprecatedAnchors.length === 0 ? "" : `
## Deprecated anchors

${deprecatedAnchors.map((id) => `- \`${id}\` preserved for human references`).join(`
`)}
`;
  return `---
artifactId: ${spec.artifactId}
revision: ${spec.revision}
---

# ${spec.title}

![[${drawing}]]

- SVG: [[${svg}]]
- Source: \`${spec.source.root}\`
- Commit: \`${spec.source.commit ?? "uncommitted"}\`

## Evidence status

${claims}${anchors}`;
}

// src/bootstrap-notes.ts
function frontmatter(fields) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `---
${lines.join(`
`)}
---

`;
}
function note(fields, title, body) {
  return `${frontmatter(fields)}# ${title}

${body.trim()}
`;
}
function kindLink(project, spec) {
  return `[[${artifactPaths(project, spec.artifactId).note}|${spec.title}]]`;
}
function writeProjectNotes(root, project, source, specs, restoreArtifactId) {
  const commit = source.commit ?? "null";
  const base = join3(root, "Engineering Atlas/10 Projects", project);
  const byKind = new Map(specs.map((spec) => [spec.kind, kindLink(project, spec)]));
  const files = new Map([
    [
      "00 Map.md",
      note({ atlas_type: "project-home", status: "active", project }, "Sample Agent Project", `- Source: \`${source.root}\`
- Commit: \`${commit}\`
- Legend: [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Visual Legend|Visual Legend]]
- Troubleshooting: [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Troubleshooting|Troubleshooting]]
- Study next: [[Engineering Atlas/10 Projects/${project}/05 Study Notes/What to Study Next|What to Study Next]]

## Artifact kinds
- Project map: ${byKind.get("project-map") ?? "not bootstrapped"}
- System: ${byKind.get("system-architecture") ?? "not bootstrapped"}
- Container: ${byKind.get("container-architecture") ?? "not bootstrapped"}
- Component: ${byKind.get("component-architecture") ?? "not bootstrapped"}
- ADR: ${byKind.get("adr") ?? "not bootstrapped"}
- API: ${byKind.get("api-contract") ?? "not bootstrapped"}
- Workflow: ${byKind.get("workflow") ?? "not bootstrapped"}
- Data flow: ${byKind.get("data-flow") ?? "not bootstrapped"}
- Trust boundary: ${byKind.get("trust-boundary") ?? "not bootstrapped"}
- Code exploration: ${byKind.get("code-exploration") ?? "not bootstrapped"}

## Walkthroughs
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Create Walkthrough|Create]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Extend Walkthrough|Extend]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Refresh Walkthrough|Refresh]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Restore Walkthrough|Restore]]
- [[Engineering Atlas/10 Projects/${project}/05 Study Notes/Prompt Recipes|Prompt Recipes]]`)
    ],
    [
      "02 ADR/Decision Tradeoff Map.md",
      note({ atlas_type: "study-index", status: "active", project }, "Decision Tradeoff Map", `${byKind.get("adr") ?? "-"}

\uC774 \uB178\uD2B8\uB294 \uD559\uC2B5\uC6A9 ADR \uC0B0\uCD9C\uBB3C\uC744 \uAC00\uB9AC\uD0B5\uB2C8\uB2E4.`)
    ],
    [
      "03 API/Contract Journey.md",
      note({ atlas_type: "study-index", status: "active", project }, "Contract Journey", `${byKind.get("api-contract") ?? "-"}

API contract\uC640 endpoint journey\uB97C \uD55C \uACF3\uC5D0\uC11C \uC2DC\uC791\uD569\uB2C8\uB2E4.`)
    ],
    [
      "04 Workflows/Sequence Walkthrough.md",
      note({ atlas_type: "study-index", status: "active", project }, "Sequence Walkthrough", `${byKind.get("workflow") ?? "-"}

Workflow\uC640 sequence \uAD00\uCC30\uC744 \uC774\uC5B4\uC11C \uC77D\uC2B5\uB2C8\uB2E4.`)
    ],
    [
      "05 Study Notes/What to Study Next.md",
      note({ atlas_type: "study-note", status: "active", project }, "What to Study Next", `- [ ] ${byKind.get("trust-boundary") ?? "Trust boundary"}\uC5D0\uC11C \uAD8C\uD55C \uACBD\uACC4\uB97C fact\uB85C \uC2B9\uACA9\uD569\uB2C8\uB2E4.
- [ ] ${byKind.get("code-exploration") ?? "Code exploration"}\uC5D0\uC11C \`PaymentGateway\` \uC2E4\uD328 \uACBD\uB85C\uB97C \uCD94\uAC00\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.
- [ ] ${byKind.get("adr") ?? "ADR"}\uC640 \uC800\uC7A5\uC18C \uBB38\uC11C\uC758 \uCC28\uC774\uB97C \uC9C8\uBB38\uC73C\uB85C \uB0A8\uAE41\uB2C8\uB2E4.`)
    ],
    [
      "05 Study Notes/Prompt Recipes.md",
      note({ atlas_type: "study-note", status: "active", project }, "Prompt Recipes", `- \uD504\uB85C\uC81D\uD2B8 \uB9F5: \`$SKILL/bin/visual-note bootstrap --root "$ROOT" --project ${project} --source "$SOURCE" --bundle "$SKILL/tests/fixtures/sample-project/bundle.json" --json\`
- \uD2B9\uC815 artifact \uCD94\uAC00: \`$SKILL/bin/visual-note create --root "$ROOT" --project ${project} --spec "$ROOT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json" --json\`
- refresh \uC804 \uC9C8\uBB38: \`\uC5B4\uB5A4 node\uB97C \uC720\uC9C0\uD558\uACE0 \uC5B4\uB5A4 edge\uB97C deprecatedAnchor \uC5C6\uC774 \uC9C0\uC6B8 \uC218 \uC788\uB294\uAC00?\``)
    ],
    [
      "05 Study Notes/Create Walkthrough.md",
      note({ atlas_type: "study-note", status: "active", project }, "Create Walkthrough", `1. \`$SKILL/bin/visual-note validate --spec "$ROOT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json" --json\`
2. \`$SKILL/bin/visual-note create --root "$ROOT" --project ${project} --spec "$ROOT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json" --json\``)
    ],
    [
      "05 Study Notes/Extend Walkthrough.md",
      note({ atlas_type: "study-note", status: "active", project }, "Extend Walkthrough", `\`$SKILL/bin/visual-note extend --spec "$ROOT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-extend.json" --json\``)
    ],
    [
      "05 Study Notes/Refresh Walkthrough.md",
      note({ atlas_type: "study-note", status: "active", project }, "Refresh Walkthrough", `\`$SKILL/bin/visual-note refresh --root "$ROOT" --project ${project} --spec "$ROOT/Engineering Atlas/10 Projects/${project}/_assets/walkthrough-refresh-v2.json" --expected-token cas-0 --json\``)
    ],
    [
      "05 Study Notes/Restore Walkthrough.md",
      note({ atlas_type: "study-note", status: "active", project }, "Restore Walkthrough", `\`$SKILL/bin/visual-note restore --root "$ROOT" --project ${project} --artifact-id ${restoreArtifactId} --revision-token cas-0 --expected-token cas-1 --json\``)
    ],
    [
      "05 Study Notes/Visual Legend.md",
      note({ atlas_type: "study-note", status: "active", project }, "Visual Legend", `- \`fact\`: \uD30C\uB780/\uCD08\uB85D \uACC4\uC5F4, repository-relative evidence \uD544\uC218
- \`inference\`: \uC8FC\uD669 \uC810\uC120, \uCD94\uB860\uC784\uC744 \uC720\uC9C0
- \`question\`: \uBCF4\uB77C/\uD68C\uC0C9, unknown \uD5C8\uC6A9
- \`owner=agent\`: refresh \uB300\uC0C1
- \`owner=human\`: byte-for-byte \uBCF4\uC874 \uB300\uC0C1`)
    ],
    [
      "05 Study Notes/Troubleshooting.md",
      note({ atlas_type: "study-note", status: "active", project }, "Troubleshooting", `- source unavailable: \uC785\uB825 \uACBD\uB85C \uC874\uC7AC \uC5EC\uBD80\uC640 \uC77D\uAE30 \uAD8C\uD55C\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.
- path swap: symlink \uB610\uB294 ancestor swap\uC774 \uAC10\uC9C0\uB418\uBA74 \uB2E4\uC2DC bootstrap \uD569\uB2C8\uB2E4.
- repo dirty: Git source\uB294 clean status\uC5D0\uC11C\uB9CC revision\uC744 \uAE30\uB85D\uD569\uB2C8\uB2E4.
- stale token: \`STATE\`\uC758 \uCD5C\uC2E0 token\uC744 \uB2E4\uC2DC \uC77D\uACE0 retry \uD569\uB2C8\uB2E4.
- wrong root: \`--root\`\uAC00 \uAE30\uC874 \uC2E4\uC81C \uB514\uB809\uD130\uB9AC\uB97C \uAC00\uB9AC\uD0A4\uB294\uC9C0 \uD655\uC778\uD569\uB2C8\uB2E4.`)
    ]
  ]);
  for (const [relativePath, content] of files) {
    const absolutePath = join3(base, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
}

// src/path-guard.ts
import { lstatSync as lstatSync2 } from "fs";
import { isAbsolute as isAbsolute2, join as join4, normalize as normalize2, sep } from "path";
function ensureNormalizedAbsolute(path, label) {
  if (!isAbsolute2(path) || path === "/" || normalize2(path) !== path) {
    throw new InputError(`${label} must be a normalized absolute non-root path`);
  }
  return path;
}
function ensureRealDirectory(path, label) {
  const checked = ensureNormalizedAbsolute(path, label);
  const parts = checked.split(sep).filter(Boolean);
  let current = sep;
  for (const part of parts) {
    current = join4(current, part);
    let status;
    try {
      status = lstatSync2(current);
    } catch (error) {
      throw new InputError(`${label} is unavailable: ${path}`, { cause: error });
    }
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new InputError(`${label} must be a real directory`);
    }
  }
  return checked;
}

// src/project-publish.ts
import {
  lstatSync as lstatSync3,
  mkdirSync as mkdirSync2,
  readdirSync,
  readFileSync as readFileSync3,
  renameSync,
  rmSync,
  writeFileSync as writeFileSync2
} from "fs";
import { dirname as dirname2, join as join5, relative } from "path";
var bootstrapReceiptPrefix2 = "bootstrap:";
function normalizedBootstrapReceipt(projectRoot, artifactId, token) {
  const workingRelative = join5("_generated/drawings", `${artifactId}.working.${token}.excalidraw.md`);
  const bytes = readFileSync3(join5(projectRoot, workingRelative));
  const fullHash = sha256(bytes);
  return {
    inode: `${bootstrapReceiptPrefix2}${sha256(workingRelative)}`,
    generation: `${bootstrapReceiptPrefix2}${sha256(`${workingRelative}:${bytes.byteLength}:${fullHash}`)}`,
    fullHash,
    eventSequence: 0
  };
}
function normalizeHistoryRecords(projectRoot) {
  const historyRoot = join5(projectRoot, "_history");
  try {
    for (const entry of readdirSync(historyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue;
      const artifactRoot = join5(historyRoot, entry.name);
      for (const name of ["STATE", "COMMITTED", "BEGIN"]) {
        const recordPath = join5(artifactRoot, name);
        if (!lstatSync3(recordPath, { throwIfNoEntry: false })?.isFile())
          continue;
        const record = readJson(recordPath);
        for (const field of ["revisionPath", "workingPath", "sourcePath"]) {
          const value = record[field];
          if (typeof value === "string" && value.startsWith(projectRoot)) {
            record[field] = value.slice(projectRoot.length + 1);
          }
        }
        writeFileSync2(recordPath, jsonBytes(record));
      }
      const metadataPath = join5(artifactRoot, "revisions", "cas-0", "metadata.json");
      const metadata = readJson(metadataPath);
      if (metadata.token !== metadata.previousToken)
        continue;
      const sourceReceipt = normalizedBootstrapReceipt(projectRoot, entry.name, metadata.token);
      writeFileSync2(metadataPath, jsonBytes({
        ...metadata,
        sourceReceipt,
        bundleHashes: {
          ...metadata.bundleHashes,
          metadataPayload: sha256(jsonBytes({
            schemaVersion: metadata.schemaVersion,
            token: metadata.token,
            previousToken: metadata.previousToken,
            revision: metadata.revision,
            sceneGeneration: metadata.sceneGeneration,
            sourceReceipt,
            agentBaseHash: metadata.agentBaseHash
          }))
        }
      }));
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }
}
function stripLockResidue(root) {
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join5(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".rwlock") {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
        visit(path);
      }
    }
  };
  visit(root);
}
function sanitizeProjectTree(root) {
  stripLockResidue(root);
  normalizeHistoryRecords(root);
}
function fileHash(path) {
  return sha256(readFileSync3(path));
}
function walk(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join5(directory, entry.name);
      const status = lstatSync3(path);
      if (status.isSymbolicLink())
        throw new InputError(`symlink rejected: ${path}`);
      if (status.isDirectory()) {
        visit(path);
        continue;
      }
      if (!status.isFile())
        throw new InputError(`special file rejected: ${path}`);
      files.push(relative(root, path));
    }
  };
  visit(root);
  return files.sort();
}
function sameDirectory(left, right) {
  const leftFiles = walk(left);
  const rightFiles = walk(right);
  if (leftFiles.length !== rightFiles.length)
    return false;
  return leftFiles.every((file, index) => file === rightFiles[index] && fileHash(join5(left, file)) === fileHash(join5(right, file)));
}
function publishProjectDirectory(stageProject, targetProject) {
  sanitizeProjectTree(stageProject);
  mkdirSync2(dirname2(targetProject), { recursive: true });
  try {
    renameSync(stageProject, targetProject);
    return { status: "CREATED", targetProject };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EEXIST" && code !== "ENOTEMPTY")
      throw error;
  }
  const status = lstatSync3(targetProject);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new CollisionError(targetProject);
  }
  sanitizeProjectTree(targetProject);
  if (!sameDirectory(stageProject, targetProject))
    throw new CollisionError(targetProject);
  rmSync(stageProject, { recursive: true, force: true });
  return { status: "ALREADY_CURRENT", targetProject };
}

// src/renderer-plan.ts
import { createHash as createHash2 } from "crypto";

// src/wrap-label.ts
function wrapLabel(value) {
  return value.split(`
`).flatMap((line) => {
    const characters = Array.from(line);
    if (characters.length <= 32)
      return [line];
    const words = line.split(/\s+/u).filter(Boolean);
    if (words.length <= 1)
      return [line];
    const lines = [];
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (Array.from(candidate).length <= 32 || current.length === 0) {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = word;
    }
    if (current.length > 0)
      lines.push(current);
    return lines;
  }).join(`
`);
}

// src/renderer-plan.ts
var NODE_WIDTH = 300;
var NODE_HEIGHT = 120;
var COLUMN_STEP = 380;
var ROW_STEP = 190;
function stableElementId(artifactId, semanticId, role) {
  return createHash2("sha256").update(`${artifactId}\x00${semanticId}\x00${role}`).digest("base64url").slice(0, 8);
}
function orderedNodes(spec) {
  return [...spec.nodes].sort((left, right) => (left.visual?.order ?? Number.MAX_SAFE_INTEGER) - (right.visual?.order ?? Number.MAX_SAFE_INTEGER) || left.semanticId.localeCompare(right.semanticId));
}
function layeredPlacements(spec) {
  const ranks = new Map(spec.nodes.map((node) => [node.semanticId, 0]));
  const incoming = new Map(spec.nodes.map((node) => [node.semanticId, 0]));
  const outgoing = new Map(spec.nodes.map((node) => [node.semanticId, []]));
  for (const edge of spec.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const ready = spec.nodes.map((node) => node.semanticId).filter((id) => incoming.get(id) === 0).sort();
  const processed = new Set;
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined)
      break;
    processed.add(id);
    for (const target of [...outgoing.get(id) ?? []].sort()) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, (ranks.get(id) ?? 0) + 1));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if (incoming.get(target) === 0)
        ready.push(target);
      ready.sort();
    }
  }
  const fallbackRank = Math.max(0, ...ranks.values()) + 1;
  for (const id of ranks.keys())
    if (!processed.has(id))
      ranks.set(id, fallbackRank);
  const layers = new Map;
  for (const [id, rank] of ranks)
    layers.set(rank, [...layers.get(rank) ?? [], id]);
  const placements = new Map;
  for (const [rank, ids] of layers)
    for (const [row, id] of ids.sort().entries())
      placements.set(id, {
        x: 80 + rank * COLUMN_STEP,
        y: 180 + row * 220,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
  return placements;
}
function timelinePlacements(spec) {
  const placements = new Map;
  const lanes = new Map([
    ["main", 210],
    ["exception", 470],
    ["upstream", 80],
    ["downstream", 600]
  ]);
  let fallbackOrder = 0;
  for (const node of orderedNodes(spec)) {
    const lane = node.visual?.lane ?? "main";
    const index = node.visual?.order ?? fallbackOrder;
    fallbackOrder += 1;
    placements.set(node.semanticId, {
      x: 80 + index * COLUMN_STEP,
      y: lanes.get(lane) ?? 210,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  }
  return placements;
}
function framedPlacements(spec) {
  const frames = [...spec.presentation?.frames ?? []].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const nodes = new Map;
  const placements = [];
  for (const [column, frame] of frames.entries()) {
    const members = orderedNodes(spec).filter((node) => node.visual?.frameId === frame.id);
    const x = 60 + column * 440;
    const height = Math.max(310, 110 + members.length * ROW_STEP);
    placements.push({
      id: frame.id,
      label: frame.label,
      category: frame.category,
      x,
      y: 140,
      width: 380,
      height
    });
    for (const [row, node] of members.entries())
      nodes.set(node.semanticId, {
        x: x + 40,
        y: 230 + row * ROW_STEP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
  }
  const unframed = orderedNodes(spec).filter((node) => !nodes.has(node.semanticId));
  const x = 60 + frames.length * 440;
  for (const [row, node] of unframed.entries())
    nodes.set(node.semanticId, {
      x,
      y: 230 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  return { nodes, frames: placements };
}
function componentPlacements(spec) {
  const frames = [...spec.presentation?.frames ?? []].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const nodes = new Map;
  const placements = [];
  let y = 140;
  for (const frame of frames) {
    const members = orderedNodes(spec).filter((node) => node.visual?.frameId === frame.id);
    const columns = Math.max(1, Math.min(spec.presentation?.columns ?? 3, members.length));
    const rows = Math.max(1, Math.ceil(members.length / columns));
    const width = 80 + columns * NODE_WIDTH + (columns - 1) * 60;
    const height = Math.max(310, 110 + rows * ROW_STEP);
    placements.push({
      id: frame.id,
      label: frame.label,
      category: frame.category,
      x: 60,
      y,
      width,
      height
    });
    const lastRowCount = members.length % columns || columns;
    const lastRowOffset = (columns - lastRowCount) * (NODE_WIDTH + 60) / 2;
    for (const [index, node] of members.entries()) {
      const row = Math.floor(index / columns);
      const isLastRow = row === rows - 1;
      nodes.set(node.semanticId, {
        x: 100 + (isLastRow ? lastRowOffset : 0) + index % columns * (NODE_WIDTH + 60),
        y: y + 90 + row * ROW_STEP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
    }
    y += height + 60;
  }
  const unframed = orderedNodes(spec).filter((node) => !nodes.has(node.semanticId));
  for (const [column, node] of unframed.entries())
    nodes.set(node.semanticId, {
      x: 60 + column * COLUMN_STEP,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  return { nodes, frames: placements };
}
function hubPlacements(spec) {
  const placements = new Map;
  const nodes = orderedNodes(spec);
  const primary = nodes.filter((node) => node.visual?.emphasis === "primary");
  const hubs = primary.length > 0 ? primary : nodes.slice(0, 1);
  const hubIds = new Set(hubs.map((node) => node.semanticId));
  for (const [row, hub] of hubs.entries())
    placements.set(hub.semanticId, {
      x: 560,
      y: 170 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  const upstream = nodes.filter((node) => !hubIds.has(node.semanticId) && (node.visual?.lane ?? "upstream") === "upstream");
  const downstream = nodes.filter((node) => !hubIds.has(node.semanticId) && node.visual?.lane !== "upstream");
  for (const [row, node] of upstream.entries())
    placements.set(node.semanticId, {
      x: 80,
      y: 170 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  for (const [row, node] of downstream.entries())
    placements.set(node.semanticId, {
      x: 1040,
      y: 170 + row * ROW_STEP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  return placements;
}
function connection(from, to) {
  const fromCenter = [from.x + from.width / 2, from.y + from.height / 2];
  const toCenter = [to.x + to.width / 2, to.y + to.height / 2];
  if (Math.abs(toCenter[0] - fromCenter[0]) >= Math.abs(toCenter[1] - fromCenter[1])) {
    const right = toCenter[0] >= fromCenter[0];
    return [
      [right ? from.x + from.width : from.x, fromCenter[1]],
      [right ? to.x : to.x + to.width, toCenter[1]]
    ];
  }
  const down = toCenter[1] >= fromCenter[1];
  return [
    [fromCenter[0], down ? from.y + from.height : from.y],
    [toCenter[0], down ? to.y : to.y + to.height]
  ];
}
function planScene(spec, idFactory = stableElementId) {
  const layout = spec.presentation?.layout ?? "layered";
  const framed = layout === "components" ? componentPlacements(spec) : ["frames", "trust-boundary"].includes(layout) ? framedPlacements(spec) : undefined;
  const placements = framed?.nodes ?? (layout === "timeline" ? timelinePlacements(spec) : layout === "hub" ? hubPlacements(spec) : layeredPlacements(spec));
  const ids = new Set;
  const elements = [];
  const add = (fields) => {
    const id = idFactory(spec.artifactId, fields.semanticId, fields.role);
    if (ids.has(id))
      throw new CollisionError(`Excalidraw element ID collision: ${id}`);
    ids.add(id);
    const { status, category = "neutral", evidence, ...element } = fields;
    elements.push({
      ...element,
      id,
      customData: {
        schemaVersion: 1,
        owner: "agent",
        artifactId: spec.artifactId,
        semanticId: fields.semanticId,
        elementRole: fields.role,
        revision: spec.revision,
        status,
        category,
        evidence
      }
    });
  };
  for (const frame of framed?.frames ?? []) {
    add({
      semanticId: `frame-${frame.id}`,
      role: "frame-shape",
      type: "rectangle",
      ...frame,
      text: null,
      points: [],
      status: "fact",
      category: frame.category,
      evidence: []
    });
    add({
      semanticId: `frame-${frame.id}`,
      role: "frame-label",
      type: "text",
      x: frame.x + 24,
      y: frame.y + 20,
      width: frame.width - 48,
      height: 44,
      text: frame.label,
      points: [],
      status: "fact",
      category: frame.category,
      evidence: []
    });
  }
  const edges = [...spec.edges].sort((a, b) => a.semanticId.localeCompare(b.semanticId));
  for (const [edgeIndex, edge] of edges.entries()) {
    const from = placements.get(edge.from);
    const to = placements.get(edge.to);
    if (from === undefined || to === undefined)
      throw new TypeError("validated edge endpoint missing");
    const [start, end] = connection(from, to);
    const points = [
      [0, 0],
      [end[0] - start[0], end[1] - start[1]]
    ];
    const stagger = [-24, 0, 24][edgeIndex % 3] ?? 0;
    const mostlyHorizontal = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]);
    add({
      semanticId: edge.semanticId,
      role: "edge-line",
      type: "arrow",
      x: start[0],
      y: start[1],
      width: Math.abs(points[1][0]),
      height: Math.abs(points[1][1]),
      text: null,
      points,
      status: edge.status,
      category: "neutral",
      evidence: edge.evidence
    });
    add({
      semanticId: edge.semanticId,
      role: "edge-label",
      type: "text",
      x: (start[0] + end[0]) / 2 - 80 + (mostlyHorizontal ? 0 : stagger),
      y: (start[1] + end[1]) / 2 - 20 + (mostlyHorizontal ? stagger : 0),
      width: 160,
      height: 40,
      text: wrapLabel(edge.label),
      points: [],
      status: edge.status,
      category: "neutral",
      evidence: edge.evidence
    });
  }
  for (const node of orderedNodes(spec)) {
    const placement = placements.get(node.semanticId);
    if (placement === undefined)
      throw new TypeError("node placement missing");
    const category = node.visual?.category ?? "neutral";
    add({
      semanticId: node.semanticId,
      role: "node-shape",
      type: node.visual?.shape ?? "rectangle",
      ...placement,
      text: null,
      points: [],
      status: node.status,
      category,
      evidence: node.evidence
    });
    add({
      semanticId: node.semanticId,
      role: "node-label",
      type: "text",
      x: placement.x + 20,
      y: placement.y + 24,
      width: placement.width - 40,
      height: placement.height - 48,
      text: wrapLabel(node.label),
      points: [],
      status: node.status,
      category,
      evidence: node.evidence
    });
  }
  const right = Math.max(520, ...[...placements.values()].map((placement) => placement.x + placement.width - 80));
  add({
    semanticId: "artifact",
    role: "title",
    type: "text",
    x: 80,
    y: 50,
    width: right,
    height: 64,
    text: spec.title,
    points: [],
    status: "question",
    category: "neutral",
    evidence: []
  });
  return {
    schemaVersion: 1,
    artifactId: spec.artifactId,
    revision: spec.revision,
    title: spec.title,
    elements
  };
}

// src/scene-bootstrap.ts
var CATEGORY_PALETTE = {
  cloudflare: { stroke: "#e8590c", background: "#fff4e6" },
  aws: { stroke: "#f08c00", background: "#fff9db" },
  external: { stroke: "#64748b", background: "#f8fafc" },
  data: { stroke: "#1971c2", background: "#e7f5ff" },
  runtime: { stroke: "#7950f2", background: "#f3f0ff" },
  security: { stroke: "#2f9e44", background: "#ebfbee" },
  risk: { stroke: "#e03131", background: "#fff5f5" },
  neutral: { stroke: "#475569", background: "#f8fafc" }
};
function hashId(value) {
  let hash = 0;
  for (const character of value)
    hash = hash * 31 + character.charCodeAt(0) >>> 0;
  return hash;
}
function sceneFromSpec(spec, source) {
  const plan = planScene(spec);
  return {
    type: "excalidraw",
    version: 2,
    source,
    elements: plan.elements.map((element, index) => {
      const palette = CATEGORY_PALETTE[element.customData.category];
      const isShape = ["rectangle", "ellipse", "diamond"].includes(element.type);
      return {
        id: element.id,
        type: element.type,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: 0,
        strokeColor: palette.stroke,
        backgroundColor: isShape ? palette.background : "transparent",
        fillStyle: "solid",
        strokeWidth: element.role === "title" ? 1 : 2,
        strokeStyle: element.customData.status === "inference" ? "dashed" : "solid",
        roughness: element.role === "edge-line" ? 1 : element.role.startsWith("frame") ? 0 : 0.7,
        opacity: element.role === "frame-shape" ? 32 : 100,
        roundness: null,
        seed: hashId(`${element.id}:seed`),
        version: 1,
        versionNonce: hashId(`${element.id}:nonce`),
        updated: 1700000000000 + index,
        isDeleted: false,
        groupIds: element.role === "title" || element.role.startsWith("frame") ? [] : [`visual-note:${spec.artifactId}:${element.semanticId}`],
        boundElements: [],
        link: null,
        locked: false,
        frameId: null,
        hasTextLink: false,
        ...element.type === "text" ? {
          text: element.text ?? "",
          fontSize: element.role === "title" ? 34 : element.role === "frame-label" ? 24 : element.role === "edge-label" ? 13 : 20,
          fontFamily: element.role === "edge-label" ? 2 : 1,
          textAlign: element.role === "frame-label" ? "left" : "center",
          verticalAlign: "middle",
          containerId: null,
          originalText: element.text ?? "",
          rawText: element.text ?? "",
          lineHeight: 1.25,
          autoResize: false
        } : {},
        ...element.type === "arrow" ? {
          points: element.points.map((point) => [...point]),
          elbowed: false,
          lastCommittedPoint: null,
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: "arrow"
        } : {},
        customData: structuredClone(element.customData)
      };
    }),
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files: {}
  };
}

// src/source-revision.ts
function readSourceRevision(source) {
  const result = Bun.spawnSync(["git", "-C", source, "rev-parse", "--verify", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" }
  });
  if (result.exitCode !== 0)
    return null;
  return string2().regex(/^[0-9a-f]{40,64}$/).parse(result.stdout.toString().trim());
}

// src/transaction-bootstrap.ts
import { mkdirSync as mkdirSync4 } from "fs";

// src/lz-string.ts
var fromCharCode = String.fromCharCode;
var keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
var baseReverse = new Map;
function getBaseValue(alphabet, character) {
  let lookup = baseReverse.get(alphabet);
  if (lookup === undefined) {
    lookup = new Map;
    for (let index = 0;index < alphabet.length; index += 1) {
      lookup.set(alphabet.charAt(index), index);
    }
    baseReverse.set(alphabet, lookup);
  }
  return lookup.get(character) ?? 0;
}
function compress(uncompressed, bitsPerChar, getCharFromInt) {
  if (uncompressed === "")
    return "";
  const dictionary = {};
  const dictionaryToCreate = {};
  let contextC = "";
  let contextW = "";
  let contextWC = "";
  let contextEnlargeIn = 2;
  let contextDictSize = 3;
  let contextNumBits = 2;
  const contextData = [];
  let contextDataVal = 0;
  let contextDataPosition = 0;
  const pushBit = (bit) => {
    contextDataVal = contextDataVal << 1 | bit;
    if (contextDataPosition === bitsPerChar - 1) {
      contextDataPosition = 0;
      contextData.push(getCharFromInt(contextDataVal));
      contextDataVal = 0;
      return;
    }
    contextDataPosition += 1;
  };
  const writeBits = (width, rawValue) => {
    let value = rawValue;
    for (let index = 0;index < width; index += 1) {
      pushBit(value & 1);
      value >>= 1;
    }
  };
  const emit = (value) => {
    if (dictionaryToCreate[value]) {
      const code = value.charCodeAt(0);
      if (code < 256) {
        writeBits(contextNumBits, 0);
        writeBits(8, code);
      } else {
        writeBits(contextNumBits, 1);
        writeBits(16, code);
      }
      contextEnlargeIn -= 1;
      if (contextEnlargeIn === 0) {
        contextEnlargeIn = 2 ** contextNumBits;
        contextNumBits += 1;
      }
      delete dictionaryToCreate[value];
      return;
    }
    writeBits(contextNumBits, dictionary[value] ?? 0);
  };
  for (let index = 0;index < uncompressed.length; index += 1) {
    contextC = uncompressed.charAt(index);
    if (dictionary[contextC] === undefined) {
      dictionary[contextC] = contextDictSize;
      contextDictSize += 1;
      dictionaryToCreate[contextC] = true;
    }
    contextWC = contextW + contextC;
    if (dictionary[contextWC] !== undefined) {
      contextW = contextWC;
      continue;
    }
    emit(contextW);
    contextEnlargeIn -= 1;
    if (contextEnlargeIn === 0) {
      contextEnlargeIn = 2 ** contextNumBits;
      contextNumBits += 1;
    }
    dictionary[contextWC] = contextDictSize;
    contextDictSize += 1;
    contextW = String(contextC);
  }
  if (contextW !== "") {
    emit(contextW);
    contextEnlargeIn -= 1;
    if (contextEnlargeIn === 0) {
      contextEnlargeIn = 2 ** contextNumBits;
      contextNumBits += 1;
    }
  }
  writeBits(contextNumBits, 2);
  while (true) {
    contextDataVal <<= 1;
    if (contextDataPosition === bitsPerChar - 1) {
      contextData.push(getCharFromInt(contextDataVal));
      break;
    }
    contextDataPosition += 1;
  }
  return contextData.join("");
}
function decompress(length, resetValue, getNextValue) {
  const dictionary = [];
  let next = 0;
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  const result = [];
  let bits = 0;
  let resb = 0;
  let maxpower = 0;
  let power = 0;
  let c = "";
  let dataVal = getNextValue(0);
  let dataPosition = resetValue;
  let dataIndex = 1;
  for (let index = 0;index < 3; index += 1)
    dictionary[index] = String(index);
  const readBits = (width) => {
    bits = 0;
    maxpower = 2 ** width;
    power = 1;
    while (power !== maxpower) {
      resb = dataVal & dataPosition;
      dataPosition >>= 1;
      if (dataPosition === 0) {
        dataPosition = resetValue;
        dataVal = getNextValue(dataIndex);
        dataIndex += 1;
      }
      if (resb > 0)
        bits |= power;
      power <<= 1;
    }
    return bits;
  };
  next = readBits(2);
  switch (next) {
    case 0:
      c = fromCharCode(readBits(8));
      break;
    case 1:
      c = fromCharCode(readBits(16));
      break;
    case 2:
      return "";
    default:
      break;
  }
  dictionary[3] = c;
  let word = c;
  result.push(c);
  while (true) {
    if (dataIndex > length)
      return "";
    let code = readBits(numBits);
    if (code === 0) {
      dictionary[dictSize] = fromCharCode(readBits(8));
      code = dictSize;
      dictSize += 1;
      enlargeIn -= 1;
    } else if (code === 1) {
      dictionary[dictSize] = fromCharCode(readBits(16));
      code = dictSize;
      dictSize += 1;
      enlargeIn -= 1;
    } else if (code === 2) {
      return result.join("");
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }
    if (dictionary[code] !== undefined) {
      entry = dictionary[code] ?? "";
    } else if (code === dictSize) {
      entry = word + word.charAt(0);
    } else {
      return null;
    }
    result.push(entry);
    dictionary[dictSize] = word + entry.charAt(0);
    dictSize += 1;
    enlargeIn -= 1;
    word = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }
  }
}
function compressToBase64(input) {
  if (input === "")
    return "";
  const result = compress(input, 6, (value) => keyStrBase64.charAt(value));
  switch (result.length % 4) {
    case 0:
      return result;
    case 1:
      return `${result}===`;
    case 2:
      return `${result}==`;
    default:
      return `${result}=`;
  }
}
function decompressFromBase64(input) {
  if (input === "")
    return null;
  return decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)));
}

// src/excalidraw-file.ts
var compressedDrawing = /```compressed-json\n([\s\S]*?)\n```/m;
var plainDrawing = /```json\n([\s\S]*?)\n```/m;
function sceneJson(scene) {
  return `${JSON.stringify(scene, null, "\t")}
`;
}
function textSection(scene) {
  const lines = scene.elements.filter((element) => element.type === "text" && element.isDeleted !== true).map((element) => `${String(element.text ?? "")} ^${element.id}`);
  return lines.length === 0 ? `## Text Elements
` : `## Text Elements
${lines.join(`

`)}
`;
}
function chunkedBase64(value) {
  const lines = [];
  for (let index = 0;index < value.length; index += 256) {
    lines.push(value.slice(index, index + 256));
    lines.push("");
  }
  lines.pop();
  return lines.join(`
`);
}
function encodeSceneToMarkdown(scene) {
  return `---

excalidraw-plugin: parsed

---
# Excalidraw Data

${textSection(scene)}
%%
## Drawing
\`\`\`compressed-json
${chunkedBase64(compressToBase64(sceneJson(scene)))}
\`\`\`
%%
`;
}
function parseSceneMarkdown(markdown) {
  const compressed = markdown.match(compressedDrawing);
  const raw = compressed?.[1] ?? markdown.match(plainDrawing)?.[1];
  if (raw === undefined)
    throw new InputError("missing Excalidraw drawing block");
  const json = compressed ? decompressFromBase64(raw.replace(/[\r\n]/g, "")) : raw;
  if (json === null)
    throw new InputError("malformed compressed Excalidraw scene");
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || !("elements" in parsed) || !Array.isArray(parsed.elements)) {
    throw new InputError("malformed Excalidraw scene");
  }
  return { scene: parsed, compressed: compressed !== null };
}

// src/transaction-agent.ts
import { lstatSync as lstatSync4, readFileSync as readFileSync4 } from "fs";
import { basename } from "path";
function stable(value) {
  if (Array.isArray(value))
    return value.map((entry) => stable(entry));
  if (typeof value !== "object" || value === null)
    return value;
  const next = {};
  for (const key of Object.keys(value).sort())
    next[key] = stable(value[key]);
  return next;
}
var PROJECTED_FIELDS = [
  "id",
  "type",
  "strokeColor",
  "backgroundColor",
  "strokeStyle",
  "strokeWidth",
  "fillStyle",
  "points"
];
function legacyElement(element) {
  const owner = element.customData?.["owner"];
  if (owner !== "agent")
    return;
  return stable(element);
}
function projectElement(element) {
  const owner = element.customData?.["owner"];
  if (owner !== "agent")
    return;
  const projection = {};
  for (const field of PROJECTED_FIELDS)
    if (element[field] !== undefined)
      projection[field] = stable(element[field]);
  projection["customData"] = stable(element.customData ?? null);
  const content = element.rawText ?? element.originalText ?? element.text;
  if (content !== undefined)
    projection["text"] = stable(content);
  return stable(projection);
}
function projectionOf(scene, normalize) {
  return scene.elements.map((element) => ({ id: element.id, value: normalize(element) })).filter((entry) => entry.value !== undefined).sort((left, right) => left.id.localeCompare(right.id)).map((entry) => entry.value);
}
function agentProjection(scene) {
  return projectionOf(scene, projectElement);
}
function agentProjectionLegacy(scene) {
  return projectionOf(scene, legacyElement);
}
function agentBaseHash(scene) {
  return sha256(JSON.stringify(agentProjection(scene)));
}
function agentBaseHashLegacy(scene) {
  return sha256(JSON.stringify(agentProjectionLegacy(scene)));
}
function agentProjectionsEqual(left, right) {
  return JSON.stringify(agentProjection(left)) === JSON.stringify(agentProjection(right));
}
function readScene(path) {
  return parseSceneMarkdown(readFileSync4(path, "utf8")).scene;
}
function fileReceipt(path, eventSequence) {
  const status = lstatSync4(path, { bigint: true });
  return {
    inode: status.ino.toString(),
    generation: `${status.mtimeNs}:${status.size}`,
    fullHash: sha256(readFileSync4(path)),
    eventSequence
  };
}
function sameReceipt(left, right) {
  return left.inode === right.inode && left.generation === right.generation && left.fullHash === right.fullHash && left.eventSequence === right.eventSequence;
}
function validateReadableWorking(path, committedSnapshotPath) {
  const scene = readScene(path);
  if (!agentProjectionsEqual(scene, readScene(committedSnapshotPath)))
    throw new RuntimeError(`BLOCKED: agent base hash mismatch for ${basename(path)}`);
  return scene;
}
function assertCasUnchanged(before, after, label) {
  if (!sameReceipt(before, after))
    throw new ConflictError(`source CAS changed at ${label}`);
}

// src/transaction-fs.ts
import {
  closeSync,
  existsSync as existsSync3,
  fsyncSync,
  mkdirSync as mkdirSync3,
  openSync,
  readFileSync as readFileSync5,
  renameSync as renameSync2,
  rmSync as rmSync2,
  unlinkSync,
  writeFileSync as writeFileSync3
} from "fs";
import { dirname as dirname3, join as join6 } from "path";
function ensureDirectory(path) {
  mkdirSync3(path, { recursive: true });
}
function fsyncFile(path) {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function fsyncDirectory(path) {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function writeTextFsynced(path, value) {
  ensureDirectory(dirname3(path));
  writeFileSync3(path, value);
  fsyncFile(path);
}
function renameAtomic(source, target) {
  ensureDirectory(dirname3(target));
  renameSync2(source, target);
  fsyncDirectory(dirname3(target));
}
function writeAtomicText(path, value) {
  const temporary = join6(dirname3(path), `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  writeTextFsynced(temporary, value);
  renameAtomic(temporary, path);
}
function removePath(path) {
  rmSync2(path, { recursive: true, force: true });
  try {
    fsyncDirectory(dirname3(path));
  } catch {}
}
function writeJsonAtomic(path, value) {
  writeAtomicText(path, `${JSON.stringify(value, null, 2)}
`);
}
function readDigest(path) {
  return existsSync3(path) ? sha256(readFileSync5(path)) : "missing";
}
function removeFile(path) {
  try {
    unlinkSync(path);
  } catch {}
}

// src/transaction-layout.ts
import { join as join7 } from "path";
function transactionPaths(root, project, artifactId) {
  const artifact = artifactPaths(project, artifactId);
  const historyRoot = join7(root, artifact.base, "_history", artifactId);
  const workingRoot = join7(root, artifact.drawingFolder);
  return {
    historyRoot,
    statePath: join7(historyRoot, "STATE"),
    beginPath: join7(historyRoot, "BEGIN"),
    committedPath: join7(historyRoot, "COMMITTED"),
    burnedRoot: join7(historyRoot, "burned"),
    revisionsRoot: join7(historyRoot, "revisions"),
    workingRoot,
    lockRoot: join7(historyRoot, ".rwlock"),
    stableSpecPath: join7(root, artifact.spec),
    stableNotePath: join7(root, artifact.note),
    stableSvgPath: join7(root, artifact.svg),
    revisionPath(token) {
      return join7(historyRoot, "revisions", token);
    },
    workingPath(token) {
      return join7(workingRoot, `${artifactId}.working.${token}.excalidraw.md`);
    }
  };
}
function revisionFiles(path) {
  return {
    spec: join7(path, "spec.json"),
    note: join7(path, "note.md"),
    svg: join7(path, "export.svg"),
    snapshot: join7(path, "snapshot.excalidraw.md"),
    projection: join7(path, "agent-projection.json"),
    metadata: join7(path, "metadata.json")
  };
}
function tokenIndex(token) {
  const match = /^cas-(\d+)$/.exec(token);
  return match === null ? -1 : Number(match[1]);
}

// src/transaction-metadata.ts
import { readFileSync as readFileSync6 } from "fs";
function payload(metadata) {
  return jsonBytes(metadata);
}
function revisionContent(spec, note, svg, scene, fingerprint = "canonical") {
  const projection = fingerprint === "legacy" ? agentProjectionLegacy(scene) : agentProjection(scene);
  return {
    spec: jsonBytes(spec),
    note,
    svg,
    snapshot: encodeSceneToMarkdown(scene),
    projection: `${JSON.stringify(projection, null, 2)}
`
  };
}
function fingerprintHash(scene, fingerprint) {
  return fingerprint === "legacy" ? agentBaseHashLegacy(scene) : agentBaseHash(scene);
}
function metadataBytes(input, content) {
  const bundleHashes = {
    spec: sha256(content.spec),
    note: sha256(content.note),
    svg: sha256(content.svg),
    snapshot: sha256(content.snapshot),
    projection: sha256(content.projection),
    metadataPayload: sha256(payload(input))
  };
  return jsonBytes({ ...input, bundleHashes });
}
function parseMetadata(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync6(path, "utf8"));
  } catch {
    throw new RuntimeError(`BLOCKED: malformed revision metadata ${path}`);
  }
  const record = parsed;
  if (typeof parsed !== "object" || parsed === null || record.schemaVersion !== 1 || typeof record.token !== "string" || typeof record.previousToken !== "string" || typeof record.revision !== "number" || typeof record.sceneGeneration !== "number" || typeof record.agentBaseHash !== "string" || typeof record.sourceReceipt !== "object" || record.sourceReceipt === null || typeof record.bundleHashes !== "object" || record.bundleHashes === null) {
    throw new RuntimeError(`BLOCKED: malformed revision metadata ${path}`);
  }
  const sourceReceipt = record.sourceReceipt;
  const bundleHashes = record.bundleHashes;
  if (typeof sourceReceipt["inode"] !== "string" || typeof sourceReceipt["generation"] !== "string" || typeof sourceReceipt["fullHash"] !== "string" || typeof sourceReceipt["eventSequence"] !== "number" || typeof bundleHashes["spec"] !== "string" || typeof bundleHashes["note"] !== "string" || typeof bundleHashes["svg"] !== "string" || typeof bundleHashes["snapshot"] !== "string" || typeof bundleHashes["projection"] !== "string" || typeof bundleHashes["metadataPayload"] !== "string") {
    throw new RuntimeError(`BLOCKED: malformed revision metadata ${path}`);
  }
  return parsed;
}
function validateRevisionMetadata(path) {
  const files = revisionFiles(path);
  const metadata = parseMetadata(files.metadata);
  const content = {
    spec: readFileSync6(files.spec, "utf8"),
    note: readFileSync6(files.note, "utf8"),
    svg: readFileSync6(files.svg, "utf8"),
    snapshot: readFileSync6(files.snapshot, "utf8"),
    projection: readFileSync6(files.projection, "utf8")
  };
  const snapshotScene = parseSceneMarkdown(content.snapshot).scene;
  const derivedProjection = `${JSON.stringify(agentProjection(snapshotScene), null, 2)}
`;
  const derivedLegacy = `${JSON.stringify(agentProjectionLegacy(snapshotScene), null, 2)}
`;
  if (derivedProjection !== content.projection && derivedLegacy !== content.projection)
    throw new RuntimeError(`BLOCKED: projection mismatch ${files.projection}`);
  if (agentBaseHash(snapshotScene) !== metadata.agentBaseHash && agentBaseHashLegacy(snapshotScene) !== metadata.agentBaseHash)
    throw new RuntimeError(`BLOCKED: agent base hash mismatch ${files.snapshot}`);
  const expectedHashes = {
    spec: sha256(content.spec),
    note: sha256(content.note),
    svg: sha256(content.svg),
    snapshot: sha256(content.snapshot),
    projection: sha256(content.projection),
    metadataPayload: sha256(payload({
      schemaVersion: metadata.schemaVersion,
      token: metadata.token,
      previousToken: metadata.previousToken,
      revision: metadata.revision,
      sceneGeneration: metadata.sceneGeneration,
      sourceReceipt: metadata.sourceReceipt,
      agentBaseHash: metadata.agentBaseHash
    }))
  };
  for (const key of Object.keys(expectedHashes)) {
    if (metadata.bundleHashes[key] !== expectedHashes[key])
      throw new RuntimeError(`BLOCKED: revision hash mismatch ${files.metadata}#${key}`);
  }
  return metadata;
}

// src/transaction-publish.ts
function svgBytes(spec, scene) {
  return `<svg data-artifact="${spec.artifactId}" data-revision="${spec.revision}" data-elements="${scene.elements.length}"></svg>
`;
}
function stageRevision(path, metadata, spec, note, svg, scene, fingerprint = "canonical") {
  ensureDirectory(path);
  const files = revisionFiles(path);
  const content = revisionContent(spec, note, svg, scene, fingerprint);
  const metadataBytesValue = metadataBytes({ schemaVersion: 1, ...metadata, agentBaseHash: fingerprintHash(scene, fingerprint) }, content);
  writeTextFsynced(files.spec, content.spec);
  writeTextFsynced(files.note, content.note);
  writeTextFsynced(files.svg, content.svg);
  writeTextFsynced(files.snapshot, content.snapshot);
  writeTextFsynced(files.projection, content.projection);
  writeTextFsynced(files.metadata, metadataBytesValue);
  fsyncDirectory(path);
}
function noteForWorking(root, paths, spec, workingPath, deprecatedAnchors) {
  return noteBytes(spec, workingPath.slice(root.length + 1), paths.stableSvgPath.slice(root.length + 1), deprecatedAnchors);
}
function mirrorCurrent(paths, spec, note, svg) {
  writeAtomicText(paths.stableSpecPath, jsonBytes(spec));
  writeAtomicText(paths.stableNotePath, note);
  writeAtomicText(paths.stableSvgPath, svg);
}

// src/transaction-state.ts
import { existsSync as existsSync4, readdirSync as readdirSync2, readFileSync as readFileSync7 } from "fs";
import { dirname as dirname4, isAbsolute as isAbsolute3, join as join8, resolve } from "path";
function parseRecord(path, label) {
  try {
    return JSON.parse(readFileSync7(path, "utf8"));
  } catch {
    throw new RuntimeError(`BLOCKED: malformed ${label} at ${path}`);
  }
}
function readOptional(path, label) {
  return existsSync4(path) ? parseRecord(path, label) : null;
}
function isReceipt(value) {
  return typeof value === "object" && value !== null && typeof value.inode === "string" && typeof value.generation === "string" && typeof value.fullHash === "string" && typeof value.eventSequence === "number";
}
function projectRoot(recordPath) {
  return dirname4(dirname4(dirname4(recordPath)));
}
function toAbsolute(recordPath, value) {
  return isAbsolute3(value) ? value : resolve(projectRoot(recordPath), value);
}
function toRelative(recordPath, value) {
  return value.startsWith(projectRoot(recordPath)) ? value.slice(projectRoot(recordPath).length + 1) : value;
}
function readState(path) {
  if (!existsSync4(path))
    throw new RuntimeError(`BLOCKED: missing STATE at ${path}`);
  const parsed = parseRecord(path, "STATE");
  if (typeof parsed !== "object" || parsed === null || parsed.schemaVersion !== 1 || typeof parsed.committedToken !== "string" || typeof parsed.revisionPath !== "string" || typeof parsed.workingPath !== "string" || typeof parsed.agentBaseHash !== "string" || typeof parsed.sceneGeneration !== "number") {
    throw new RuntimeError(`BLOCKED: malformed STATE at ${path}`);
  }
  const state = parsed;
  return {
    ...state,
    revisionPath: toAbsolute(path, state.revisionPath),
    workingPath: toAbsolute(path, state.workingPath)
  };
}
function writeState(path, state) {
  writeJsonAtomic(path, {
    ...state,
    revisionPath: toRelative(path, state.revisionPath),
    workingPath: toRelative(path, state.workingPath)
  });
}
function readBegin(path) {
  const parsed = readOptional(path, "BEGIN");
  if (parsed === null)
    return null;
  if (typeof parsed !== "object" || parsed === null || parsed.schemaVersion !== 1 || typeof parsed.token !== "string" || typeof parsed.previousToken !== "string" || typeof parsed.previousStateDigest !== "string" || typeof parsed.previousSceneGeneration !== "number" || typeof parsed.sourcePath !== "string" || !isReceipt(parsed.sourceReceipt)) {
    throw new RuntimeError(`BLOCKED: malformed BEGIN at ${path}`);
  }
  const begin = parsed;
  return { ...begin, sourcePath: toAbsolute(path, begin.sourcePath) };
}
function writeBegin(path, value) {
  writeJsonAtomic(path, { ...value, sourcePath: toRelative(path, value.sourcePath) });
}
function readCommitted(path) {
  const parsed = readOptional(path, "COMMITTED");
  if (parsed === null)
    return null;
  if (typeof parsed !== "object" || parsed === null || parsed.schemaVersion !== 1 || typeof parsed.token !== "string" || typeof parsed.revisionPath !== "string" || typeof parsed.workingPath !== "string" || typeof parsed.agentBaseHash !== "string" || typeof parsed.sceneGeneration !== "number") {
    throw new RuntimeError(`BLOCKED: malformed COMMITTED at ${path}`);
  }
  const committed = parsed;
  return {
    ...committed,
    revisionPath: toAbsolute(path, committed.revisionPath),
    workingPath: toAbsolute(path, committed.workingPath)
  };
}
function writeCommitted(path, value) {
  writeJsonAtomic(path, {
    ...value,
    revisionPath: toRelative(path, value.revisionPath),
    workingPath: toRelative(path, value.workingPath)
  });
}
function nextToken(paths, state) {
  const numbers = [tokenIndex(state.committedToken)];
  for (const root of [paths.revisionsRoot, paths.burnedRoot]) {
    if (!existsSync4(root))
      continue;
    for (const entry of readdirSync2(root))
      numbers.push(tokenIndex(entry.replace(/\.json$/, "")));
  }
  const begin = readBegin(paths.beginPath);
  if (begin !== null)
    numbers.push(tokenIndex(begin.token));
  const committed = readCommitted(paths.committedPath);
  if (committed !== null)
    numbers.push(tokenIndex(committed.token));
  return `cas-${Math.max(...numbers, -1) + 1}`;
}
function burnToken(paths, token, reason) {
  writeJsonAtomic(join8(paths.burnedRoot, `${token}.json`), {
    schemaVersion: 1,
    token,
    reason
  });
}
function validateRevisionBundle(path) {
  return validateRevisionMetadata(path);
}

// src/transaction-bootstrap.ts
function bootstrapTransaction(input) {
  const paths = transactionPaths(input.root, input.project, input.spec.artifactId);
  mkdirSync4(paths.historyRoot, { recursive: true });
  const token = "cas-0";
  const workingPath = paths.workingPath(token);
  const note = noteForWorking(input.root, paths, input.spec, workingPath, []);
  const svg = svgBytes(input.spec, input.scene);
  writeAtomicText(workingPath, encodeSceneToMarkdown(input.scene));
  const state = {
    schemaVersion: 1,
    committedToken: token,
    revisionPath: paths.revisionPath(token),
    workingPath,
    agentBaseHash: agentBaseHashLegacy(input.scene),
    sceneGeneration: 0
  };
  stageRevision(paths.revisionPath(token), {
    token,
    previousToken: token,
    revision: input.spec.revision,
    sceneGeneration: state.sceneGeneration,
    sourceReceipt: fileReceipt(workingPath, 0)
  }, input.spec, note, svg, input.scene, "legacy");
  writeState(paths.statePath, state);
  mirrorCurrent(paths, input.spec, note, svg);
  writeCommitted(paths.committedPath, {
    schemaVersion: 1,
    token,
    revisionPath: state.revisionPath,
    workingPath,
    agentBaseHash: state.agentBaseHash,
    sceneGeneration: state.sceneGeneration
  });
  return {
    committedToken: token,
    revisionPath: state.revisionPath,
    workingPath,
    deprecatedAnchors: [],
    sceneGeneration: 0
  };
}
// src/transaction-commit.ts
import { readFileSync as readFileSync10, watch } from "fs";
import { basename as basename2, dirname as dirname7 } from "path";

// src/scene-links.ts
var markdownLink = /^\[[^\]]*\]\(([^)]+)\)$/;
var wikiLink = /^\[\[([^\]]+)\]\]$/;
var internalBlockRef = /^#\^([^|]+)(?:\|.*)?$/;
var pathBlockRef = /^([^#|]*)#\^([^|]+)(?:\|.*)?$/;
var markdownLinkGlobal = /\[[^\]]*\]\(([^)]+)\)/g;
var wikiLinkGlobal = /\[\[([^\]]+)\]\]/g;
function unwrapExactLink(value) {
  const markdown = markdownLink.exec(value);
  if (markdown !== null)
    return markdown[1] ?? value;
  const wiki = wikiLink.exec(value);
  if (wiki !== null)
    return wiki[1] ?? value;
  return value;
}
function cleanBlockRef(value) {
  return value.replace(/^#\^/, "").trim();
}
function exactInternalSceneLinkTarget(value) {
  const candidate = unwrapExactLink(value.trim());
  const direct = internalBlockRef.exec(candidate);
  if (direct !== null) {
    const target = cleanBlockRef(direct[1] ?? "");
    return target === "" ? null : target;
  }
  const block = pathBlockRef.exec(candidate);
  if (block === null)
    return null;
  const path = (block[1] ?? "").trim();
  if (path !== "")
    return null;
  const target = cleanBlockRef(block[2] ?? "");
  return target === "" ? null : target;
}
function sceneLinkTargets(value) {
  const targets = new Set;
  const exact = exactInternalSceneLinkTarget(value);
  if (exact !== null)
    targets.add(exact);
  for (const match of value.matchAll(markdownLinkGlobal)) {
    const target = exactInternalSceneLinkTarget(match[1] ?? "");
    if (target !== null)
      targets.add(target);
  }
  for (const match of value.matchAll(wikiLinkGlobal)) {
    const target = exactInternalSceneLinkTarget(match[1] ?? "");
    if (target !== null)
      targets.add(target);
  }
  return [...targets];
}
function pruneAgentCustomDataRefs(value, keptIds) {
  if (typeof value === "string") {
    return sceneLinkTargets(value).some((target) => !keptIds.has(target)) ? null : value;
  }
  if (Array.isArray(value))
    return value.map((item) => pruneAgentCustomDataRefs(item, keptIds));
  if (typeof value !== "object" || value === null)
    return value;
  const next = {};
  for (const [key, child] of Object.entries(value))
    next[key] = pruneAgentCustomDataRefs(child, keptIds);
  return next;
}

// src/refresh-elements.ts
function hashId2(value) {
  let hash = 0;
  for (const character of value)
    hash = hash * 31 + character.charCodeAt(0) >>> 0;
  return hash;
}
function statusStyle(status) {
  if (status === "fact")
    return { strokeColor: "#1971c2", backgroundColor: "#d0ebff", strokeStyle: "solid" };
  if (status === "inference")
    return { strokeColor: "#e67700", backgroundColor: "#fff3bf", strokeStyle: "dashed" };
  return { strokeColor: "#7048e8", backgroundColor: "#e5dbff", strokeStyle: "solid" };
}
function freshElement(planned) {
  const style = statusStyle(planned.customData.status);
  const common = {
    id: planned.id,
    type: planned.type,
    x: planned.x,
    y: planned.y,
    width: planned.width,
    height: planned.height,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: planned.type === "rectangle" ? style.backgroundColor : "transparent",
    fillStyle: "solid",
    strokeWidth: planned.role === "title" ? 1 : 2,
    strokeStyle: style.strokeStyle,
    roughness: 0,
    opacity: 100,
    roundness: null,
    seed: hashId2(planned.id),
    version: 1,
    versionNonce: hashId2(`${planned.id}:nonce`),
    updated: Date.now(),
    isDeleted: false,
    groupIds: [],
    boundElements: [],
    link: null,
    locked: false,
    frameId: null,
    hasTextLink: false,
    customData: structuredClone(planned.customData)
  };
  if (planned.type === "text") {
    return {
      ...common,
      text: planned.text ?? "",
      fontSize: planned.role === "title" ? 32 : planned.role === "edge-label" ? 16 : 20,
      fontFamily: 2,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      originalText: planned.text ?? "",
      rawText: planned.text ?? "",
      lineHeight: 1.25,
      autoResize: false
    };
  }
  if (planned.type === "arrow") {
    return {
      ...common,
      points: planned.points.map((point) => [...point]),
      elbowed: false,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow"
    };
  }
  return common;
}
function mergeAgent(current, planned) {
  const updated = structuredClone(current);
  const style = statusStyle(planned.customData.status);
  updated.strokeColor = style.strokeColor;
  updated.backgroundColor = planned.type === "rectangle" ? style.backgroundColor : "transparent";
  updated.strokeStyle = style.strokeStyle;
  updated.strokeWidth = planned.role === "title" ? 1 : 2;
  updated.customData = structuredClone(planned.customData);
  if (planned.type === "text") {
    updated.text = planned.text ?? "";
    updated.originalText = planned.text ?? "";
    updated.rawText = planned.text ?? "";
  }
  return updated;
}
function deprecatedAnchor(current, revision) {
  const anchored = structuredClone(current);
  const custom = typeof anchored.customData === "object" && anchored.customData !== null ? anchored.customData : {};
  anchored.customData = { ...custom, owner: "agent", revision, deprecatedAnchor: true };
  return anchored;
}
function pruneAgentRefs(element, keptIds) {
  const updated = structuredClone(element);
  if (Array.isArray(updated.boundElements)) {
    updated.boundElements = updated.boundElements.filter((entry) => {
      if (typeof entry === "string")
        return keptIds.has(entry);
      if (typeof entry === "object" && entry !== null && typeof entry["id"] === "string")
        return keptIds.has(entry["id"]);
      return false;
    });
  }
  if (typeof updated.containerId === "string" && !keptIds.has(updated.containerId)) {
    updated.containerId = null;
  }
  if (typeof updated.startBinding === "object" && updated.startBinding !== null && typeof updated.startBinding["elementId"] === "string" && !keptIds.has(updated.startBinding["elementId"])) {
    updated.startBinding = null;
  }
  if (typeof updated.endBinding === "object" && updated.endBinding !== null && typeof updated.endBinding["elementId"] === "string" && !keptIds.has(updated.endBinding["elementId"])) {
    updated.endBinding = null;
  }
  if (typeof updated.link === "string" && sceneLinkTargets(updated.link).some((target) => !keptIds.has(target))) {
    updated.link = null;
  }
  if (updated.customData !== undefined) {
    const customData = pruneAgentCustomDataRefs(updated.customData, keptIds);
    if (typeof customData === "object" && customData !== null && !Array.isArray(customData)) {
      updated.customData = customData;
    }
  }
  return updated;
}

// src/refresh-scene.ts
function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function ownershipOf(element, artifactId) {
  const custom = asObject(element.customData);
  const owner = typeof custom?.["owner"] === "string" ? custom["owner"] : undefined;
  if (owner === undefined || owner === "human")
    return "human";
  if (owner !== "agent")
    throw new InputError(`partial ownership on ${element.id}`);
  if (custom === null || custom["artifactId"] !== artifactId || typeof custom["semanticId"] !== "string" || typeof custom["elementRole"] !== "string") {
    throw new InputError(`partial ownership on ${element.id}`);
  }
  return "agent";
}
function customTargets(value, ids, matches, dangling) {
  if (typeof value === "string") {
    if (ids.has(value))
      matches.add(value);
    for (const target of sceneLinkTargets(value)) {
      if (ids.has(target))
        matches.add(target);
      else
        dangling.add(target);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      customTargets(item, ids, matches, dangling);
    return;
  }
  const object = asObject(value);
  if (object === null)
    return;
  for (const [key, child] of Object.entries(object)) {
    if (["owner", "artifactId", "semanticId", "elementRole", "revision", "status"].includes(key))
      continue;
    customTargets(child, ids, matches, dangling);
  }
}
function buildReferenceGraph(scene, artifactId) {
  const ids = new Set(scene.elements.map((element) => element.id));
  const ownership = new Map(scene.elements.map((element) => [element.id, ownershipOf(element, artifactId)]));
  const references = [];
  const dangling = new Set;
  const groups = new Map;
  const push = (source, kind, targetId) => {
    if (!ids.has(targetId)) {
      dangling.add(`${source.id}:${kind}:${targetId}`);
      return;
    }
    const sourceOwnership = ownership.get(source.id);
    const targetOwnership = ownership.get(targetId);
    if (sourceOwnership === undefined || targetOwnership === undefined)
      throw new TypeError("reference ownership missing");
    if (sourceOwnership === "agent" && targetOwnership === "human" && kind !== "boundElements") {
      throw new RuntimeError(`irreparable cross-ownership cycle: ${source.id} -> ${targetId}`);
    }
    references.push({ sourceId: source.id, targetId, sourceOwnership, targetOwnership, kind });
  };
  for (const element of scene.elements) {
    for (const group of (element.groupIds ?? []).filter((value) => typeof value === "string")) {
      groups.set(group, [...groups.get(group) ?? [], element.id]);
    }
    const bound = Array.isArray(element.boundElements) ? element.boundElements : [];
    for (const entry of bound) {
      if (typeof entry === "string")
        push(element, "boundElements", entry);
      const object = asObject(entry);
      if (typeof object?.["id"] === "string")
        push(element, "boundElements", object["id"]);
    }
    if (typeof element.containerId === "string")
      push(element, "containerId", element.containerId);
    const start = asObject(element.startBinding);
    if (typeof start?.["elementId"] === "string")
      push(element, "startBinding", start["elementId"]);
    const end = asObject(element.endBinding);
    if (typeof end?.["elementId"] === "string")
      push(element, "endBinding", end["elementId"]);
    if (typeof element.link === "string") {
      if (ids.has(element.link))
        push(element, "link", element.link);
      for (const target of sceneLinkTargets(element.link))
        push(element, "link", target);
    }
    const matches = new Set;
    const customDangling = new Set;
    customTargets(element.customData ?? null, ids, matches, customDangling);
    for (const target of matches)
      push(element, "customData", target);
    for (const target of customDangling)
      dangling.add(`${element.id}:customData:${target}`);
  }
  return { ownership, references, dangling: [...dangling].sort(), groups };
}

// src/refresh-apply.ts
function applyRefreshToScene(current, spec) {
  const graph = buildReferenceGraph(current, spec.artifactId);
  if (graph.dangling.length > 0)
    throw new InputError(`dangling references: ${graph.dangling.join(", ")}`);
  const planned = new Map(planScene(spec).elements.map((element) => [element.id, element]));
  const humanReferencedAgents = new Set(graph.references.filter((reference) => reference.sourceOwnership === "human" && reference.targetOwnership === "agent").map((reference) => reference.targetId));
  const built = new Map;
  const deprecatedAnchors = [];
  for (const element of current.elements) {
    const owner = graph.ownership.get(element.id);
    if (owner === "human")
      built.set(element.id, element);
    if (owner !== "agent")
      continue;
    const plannedElement = planned.get(element.id);
    if (plannedElement !== undefined)
      built.set(element.id, mergeAgent(element, plannedElement));
    else if (humanReferencedAgents.has(element.id)) {
      built.set(element.id, deprecatedAnchor(element, spec.revision));
      deprecatedAnchors.push(element.id);
    }
  }
  for (const element of planned.values())
    if (!built.has(element.id))
      built.set(element.id, freshElement(element));
  const keptIds = new Set(built.keys());
  const ordered = [];
  for (const element of current.elements) {
    const kept = built.get(element.id);
    if (kept === undefined)
      continue;
    ordered.push(graph.ownership.get(element.id) === "agent" ? pruneAgentRefs(kept, keptIds) : kept);
    built.delete(element.id);
  }
  for (const element of built.values())
    ordered.push(pruneAgentRefs(element, keptIds));
  const scene = { ...current, elements: ordered };
  const finalGraph = buildReferenceGraph(scene, spec.artifactId);
  if (finalGraph.dangling.length > 0)
    throw new InputError(`dangling references: ${finalGraph.dangling.join(", ")}`);
  return { scene, deprecatedAnchors };
}

// src/transaction-verify.ts
import { existsSync as existsSync7, readFileSync as readFileSync9 } from "fs";
import { dirname as dirname6 } from "path";

// src/transaction-lock.ts
import { randomUUID } from "crypto";
import {
  closeSync as closeSync2,
  existsSync as existsSync5,
  mkdirSync as mkdirSync5,
  openSync as openSync2,
  readdirSync as readdirSync3,
  readFileSync as readFileSync8,
  rmSync as rmSync3,
  writeFileSync as writeFileSync4
} from "fs";
import { dirname as dirname5, join as join9 } from "path";
function closeHandle(root, path) {
  rmSync3(path, { force: true, recursive: true });
  try {
    rmSync3(join9(root, "readers"), { force: false, recursive: false });
  } catch {}
}
function readerPath(root) {
  return join9(root, "readers", `${process.pid}-${randomUUID()}`);
}
function writerPath(root) {
  return join9(root, "writer");
}
function createMarker(path) {
  mkdirSync5(dirname5(path), { recursive: true });
  const descriptor = openSync2(path, "wx", 384);
  closeSync2(descriptor);
  writeFileSync4(path, `${process.pid}
`);
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function markerAlive(path) {
  try {
    const pid = Number(readFileSync8(path, "utf8").trim());
    return Number.isInteger(pid) && pidAlive(pid);
  } catch {
    return false;
  }
}
function pruneDeadReaders(root) {
  try {
    const readerRoot = join9(root, "readers");
    let alive = false;
    for (const entry of readdirSync3(readerRoot)) {
      const path = join9(readerRoot, entry);
      if (markerAlive(path))
        alive = true;
      else
        rmSync3(path, { force: true, recursive: true });
    }
    return alive;
  } catch {
    return false;
  }
}
function clearDeadWriter(root) {
  const writer = writerPath(root);
  if (existsSync5(writer) && !markerAlive(writer))
    rmSync3(writer, { force: true, recursive: true });
}
function acquireLock(root, mode) {
  mkdirSync5(root, { recursive: true });
  const writer = writerPath(root);
  clearDeadWriter(root);
  if (mode === "exclusive") {
    try {
      createMarker(writer);
      if (pruneDeadReaders(root)) {
        closeHandle(root, writer);
        throw new ConflictError(`lock busy: ${root}`);
      }
      return { root, mode, path: writer, close: () => closeHandle(root, writer) };
    } catch (error) {
      if (error instanceof ConflictError)
        throw error;
      throw new ConflictError(`lock busy: ${root}`);
    }
  }
  if (existsSync5(writer))
    throw new ConflictError(`lock busy: ${root}`);
  const reader = readerPath(root);
  createMarker(reader);
  clearDeadWriter(root);
  if (existsSync5(writer)) {
    closeHandle(root, reader);
    throw new ConflictError(`lock busy: ${root}`);
  }
  return { root, mode, path: reader, close: () => closeHandle(root, reader) };
}

// src/transaction-path.ts
import { existsSync as existsSync6, lstatSync as lstatSync5 } from "fs";
import { isAbsolute as isAbsolute4, normalize as normalize3, relative as relative2 } from "path";
function blocked(label, path) {
  return new RuntimeError(`BLOCKED: ${label} ${path}`);
}
function assertAbsolute(path, label) {
  if (!isAbsolute4(path) || normalize3(path) !== path)
    throw blocked(`malformed ${label}`, path);
}
function walkNoFollow(root, path, finalType, label) {
  assertAbsolute(root, `${label} root`);
  assertAbsolute(path, label);
  const child = relative2(root, path);
  if (child.length === 0) {
    const status = lstatSync5(path);
    if (status.isSymbolicLink())
      throw blocked(`symlinked ${label}`, path);
    if (finalType === "file" && !status.isFile())
      throw blocked(`non-file ${label}`, path);
    if (finalType === "directory" && !status.isDirectory())
      throw blocked(`non-directory ${label}`, path);
    return;
  }
  const parts = child.split("/").filter((part) => part.length > 0);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = `${current}/${part}`;
    if (!existsSync6(current))
      throw blocked(`missing ${label}`, current);
    const status = lstatSync5(current);
    if (status.isSymbolicLink())
      throw blocked(`symlinked ${label}`, current);
    const final = index === parts.length - 1;
    if (!final && !status.isDirectory())
      throw blocked(`non-directory ${label}`, current);
    if (final && finalType === "file" && !status.isFile())
      throw blocked(`non-file ${label}`, current);
    if (final && finalType === "directory" && !status.isDirectory())
      throw blocked(`non-directory ${label}`, current);
  }
}
function assertUnder(root, path, label) {
  assertAbsolute(root, `${label} root`);
  assertAbsolute(path, label);
  const child = relative2(root, path);
  if (child.length === 0 || child.startsWith("../") || child === ".." || child.includes("/../") || child.startsWith("..\\")) {
    throw blocked(`escaped ${label}`, path);
  }
}
function assertToken(token, label) {
  if (tokenIndex(token) < 0)
    throw new RuntimeError(`BLOCKED: malformed ${label} ${token}`);
}
function assertCanonicalFile(path, expected, root, label) {
  if (path !== expected)
    throw blocked(`${label} path mismatch`, path);
  assertUnder(root, path, label);
  walkNoFollow(root, path, "file", label);
}
function assertCanonicalDirectory(path, expected, root, label) {
  if (path !== expected)
    throw blocked(`${label} path mismatch`, path);
  assertUnder(root, path, label);
  walkNoFollow(root, path, "directory", label);
}
function validateStatePaths(paths, state) {
  assertToken(state.committedToken, "STATE token");
  if (!Number.isInteger(state.sceneGeneration) || state.sceneGeneration < 0)
    throw new RuntimeError(`BLOCKED: malformed sceneGeneration ${state.sceneGeneration}`);
  assertCanonicalDirectory(state.revisionPath, paths.revisionPath(state.committedToken), paths.revisionsRoot, "STATE revisionPath");
  assertCanonicalFile(state.workingPath, paths.workingPath(state.committedToken), paths.workingRoot, "STATE workingPath");
}
function validateBeginPaths(paths, begin) {
  assertToken(begin.token, "BEGIN token");
  assertToken(begin.previousToken, "BEGIN previousToken");
  assertCanonicalFile(begin.sourcePath, paths.workingPath(begin.previousToken), paths.workingRoot, "BEGIN sourcePath");
}
function validateCommittedPaths(paths, committed) {
  assertToken(committed.token, "COMMITTED token");
  if (!Number.isInteger(committed.sceneGeneration) || committed.sceneGeneration < 0)
    throw new RuntimeError(`BLOCKED: malformed COMMITTED sceneGeneration ${committed.sceneGeneration}`);
  assertCanonicalDirectory(committed.revisionPath, paths.revisionPath(committed.token), paths.revisionsRoot, "COMMITTED revisionPath");
  assertCanonicalFile(committed.workingPath, paths.workingPath(committed.token), paths.workingRoot, "COMMITTED workingPath");
}

// src/transaction-verify.ts
function cleanupAttempt(paths, token, reason) {
  removePath(paths.revisionPath(token));
  removePath(paths.workingPath(token));
  burnToken(paths, token, reason);
}
function committedMatchesState(state, committed) {
  return committed.token === state.committedToken && committed.revisionPath === state.revisionPath && committed.workingPath === state.workingPath && committed.agentBaseHash === state.agentBaseHash && committed.sceneGeneration === state.sceneGeneration;
}
function validateState(paths, state) {
  validateStatePaths(paths, state);
  const metadata = validateRevisionBundle(state.revisionPath);
  if (metadata.token !== state.committedToken)
    throw new RuntimeError(`BLOCKED: metadata token mismatch ${state.revisionPath}`);
  if (metadata.sceneGeneration !== state.sceneGeneration)
    throw new RuntimeError(`BLOCKED: metadata sceneGeneration mismatch ${state.revisionPath}`);
  if (metadata.agentBaseHash !== state.agentBaseHash)
    throw new RuntimeError(`BLOCKED: metadata agentBaseHash mismatch ${state.revisionPath}`);
  if (!existsSync7(state.workingPath))
    throw new RuntimeError(`BLOCKED: missing working copy ${state.workingPath}`);
  return {
    scene: validateReadableWorking(state.workingPath, revisionFiles(state.revisionPath).snapshot),
    metadata
  };
}
function recoverTransaction(paths) {
  const state = readState(paths.statePath);
  const begin = readBegin(paths.beginPath);
  const committed = readCommitted(paths.committedPath);
  if (begin !== null)
    validateBeginPaths(paths, begin);
  if (committed !== null)
    validateCommittedPaths(paths, committed);
  if (begin === null && committed === null) {
    return { state, scene: validateState(paths, state).scene, recovery: "clean" };
  }
  if (begin !== null && state.committedToken === begin.previousToken) {
    cleanupAttempt(paths, begin.token, "rollback-after-begin");
    removeFile(paths.beginPath);
    if (committed?.token === begin.token)
      removeFile(paths.committedPath);
    fsyncDirectory(dirname6(paths.beginPath));
    const recovered = readState(paths.statePath);
    return { state: recovered, scene: validateState(paths, recovered).scene, recovery: "rollback" };
  }
  if (begin !== null && state.committedToken === begin.token) {
    const validated = validateState(paths, state);
    if (committed !== null && !committedMatchesState(state, committed))
      throw new RuntimeError(`BLOCKED: COMMITTED tuple mismatch ${paths.committedPath}`);
    if (committed === null) {
      writeCommitted(paths.committedPath, {
        schemaVersion: 1,
        token: begin.token,
        revisionPath: state.revisionPath,
        workingPath: state.workingPath,
        agentBaseHash: state.agentBaseHash,
        sceneGeneration: state.sceneGeneration
      });
    }
    removeFile(paths.beginPath);
    fsyncDirectory(dirname6(paths.beginPath));
    return { state, scene: validated.scene, recovery: "forward" };
  }
  if (committed !== null && committedMatchesState(state, committed)) {
    return { state, scene: validateState(paths, state).scene, recovery: "forward" };
  }
  throw new RuntimeError("BLOCKED: mixed transaction tuple");
}

// src/transaction-guard.ts
function sameState(left, right) {
  return left.committedToken === right.committedToken && left.revisionPath === right.revisionPath && left.workingPath === right.workingPath && left.agentBaseHash === right.agentBaseHash && left.sceneGeneration === right.sceneGeneration;
}
function validateTuple(paths, nextState, previousDigest, sourceBefore, publishedWorking) {
  if (readDigest(paths.statePath) === previousDigest)
    throw new RuntimeError("BLOCKED: STATE rename missing");
  const reread = readState(paths.statePath);
  if (!sameState(nextState, reread))
    throw new RuntimeError("BLOCKED: STATE tuple mismatch");
  const validated = validateState(paths, reread);
  if (!sameReceipt(validated.metadata.sourceReceipt, sourceBefore))
    throw new RuntimeError("BLOCKED: source receipt mismatch");
  if (!sameReceipt(fileReceipt(reread.workingPath, publishedWorking.eventSequence), publishedWorking))
    throw new RuntimeError("BLOCKED: published working receipt mismatch");
}
function rollbackPending(paths, pendingToken, previousState) {
  if (previousState !== null)
    writeState(paths.statePath, previousState);
  removePath(paths.revisionPath(pendingToken));
  removePath(paths.workingPath(pendingToken));
  removeFile(paths.beginPath);
}

// src/transaction-commit.ts
function mark(control, name) {
  control?.onBoundary?.(name);
}
function commitPrepared(input, control) {
  const paths = transactionPaths(input.root, input.project, input.artifactId);
  const lock = acquireLock(paths.lockRoot, "exclusive");
  let subscription = null;
  let previousState = null;
  const watcher = { sequence: 0 };
  try {
    const recovered = recoverTransaction(paths);
    previousState = recovered.state;
    const state = previousState;
    if (state.committedToken !== input.expectedToken)
      throw new ConflictError(`refresh conflict: expected ${input.expectedToken}`);
    const prepared = input.prepare(recovered.scene);
    const token = nextToken(paths, state);
    const previousDigest = readDigest(paths.statePath);
    mark(control, "subscribe-before-flush");
    subscription = watch(dirname7(state.workingPath), (event, filename) => {
      if ((event === "change" || event === "rename") && filename === basename2(state.workingPath))
        watcher.sequence += 1;
    });
    const sourceBefore = fileReceipt(state.workingPath, watcher.sequence);
    mark(control, "source-cas");
    mark(control, "begin-write");
    writeBegin(paths.beginPath, {
      schemaVersion: 1,
      token,
      previousToken: state.committedToken,
      previousStateDigest: previousDigest,
      previousSceneGeneration: state.sceneGeneration,
      sourcePath: state.workingPath,
      sourceReceipt: sourceBefore
    });
    mark(control, "begin-parent-fsync");
    fsyncDirectory(dirname7(paths.beginPath));
    const workingPath = paths.workingPath(token);
    const revisionPath = paths.revisionPath(token);
    const note = noteForWorking(input.root, paths, prepared.spec, workingPath, prepared.deprecatedAnchors);
    const svg = svgBytes(prepared.spec, prepared.scene);
    mark(control, "stage-working");
    writeTextFsynced(`${workingPath}.tmp`, encodeSceneToMarkdown(prepared.scene));
    mark(control, "stage-bundle");
    stageRevision(`${revisionPath}.tmp`, {
      token,
      previousToken: state.committedToken,
      revision: prepared.spec.revision,
      sceneGeneration: state.sceneGeneration + 1,
      sourceReceipt: sourceBefore
    }, prepared.spec, note, svg, prepared.scene);
    mark(control, "prepared-write");
    mark(control, "prepared-parent-fsync");
    assertCasUnchanged(sourceBefore, fileReceipt(state.workingPath, watcher.sequence), "prepared");
    mark(control, "publish-revision");
    renameAtomic(`${revisionPath}.tmp`, revisionPath);
    mark(control, "revision-parent-fsync");
    mark(control, "publish-working");
    renameAtomic(`${workingPath}.tmp`, workingPath);
    const publishedWorking = fileReceipt(workingPath, watcher.sequence);
    mark(control, "working-parent-fsync");
    mark(control, "close-old-view");
    fsyncFile(state.workingPath);
    mark(control, "flush-complete");
    const flushed = fileReceipt(state.workingPath, watcher.sequence);
    mark(control, "close-flush-complete");
    assertCasUnchanged(sourceBefore, flushed, "close-flush-complete");
    mark(control, "final-source-cas");
    assertCasUnchanged(sourceBefore, fileReceipt(state.workingPath, watcher.sequence), "final");
    if (readDigest(paths.statePath) !== previousDigest)
      throw new ConflictError("state CAS changed");
    const nextState = {
      schemaVersion: 1,
      committedToken: token,
      revisionPath,
      workingPath,
      agentBaseHash: agentBaseHash(prepared.scene),
      sceneGeneration: state.sceneGeneration + 1
    };
    mark(control, "state-rename");
    writeState(paths.statePath, nextState);
    mark(control, "state-parent-fsync");
    mark(control, "validate-state-tuple");
    validateTuple(paths, nextState, previousDigest, sourceBefore, publishedWorking);
    mirrorCurrent(paths, prepared.spec, note, svg);
    mark(control, "committed-write");
    writeCommitted(paths.committedPath, {
      schemaVersion: 1,
      token,
      revisionPath,
      workingPath,
      agentBaseHash: nextState.agentBaseHash,
      sceneGeneration: nextState.sceneGeneration
    });
    mark(control, "committed-parent-fsync");
    removeFile(paths.beginPath);
    mark(control, "open-new-view");
    return {
      committedToken: token,
      revisionPath,
      workingPath,
      deprecatedAnchors: prepared.deprecatedAnchors,
      sceneGeneration: nextState.sceneGeneration
    };
  } catch (error) {
    const pending = readBegin(paths.beginPath);
    if (pending !== null) {
      rollbackPending(paths, pending.token, previousState);
      writeJsonAtomic(`${paths.burnedRoot}/${pending.token}.json`, {
        schemaVersion: 1,
        token: pending.token,
        reason: error instanceof Error ? error.message : "unknown"
      });
    }
    throw error;
  } finally {
    subscription?.close();
    lock.close();
  }
}
function refreshTransaction(input, control) {
  return commitPrepared({
    root: input.root,
    project: input.project,
    artifactId: input.spec.artifactId,
    expectedToken: input.expectedToken,
    prepare(scene) {
      const refreshed = applyRefreshToScene(scene, input.spec);
      return {
        spec: input.spec,
        scene: refreshed.scene,
        deprecatedAnchors: refreshed.deprecatedAnchors
      };
    }
  }, control);
}
function restoreTransaction(input, control) {
  const files = revisionFiles(transactionPaths(input.root, input.project, input.artifactId).revisionPath(input.revisionToken));
  const spec = JSON.parse(readFileSync10(files.spec, "utf8"));
  const scene = parseSceneMarkdown(readFileSync10(files.snapshot, "utf8")).scene;
  return commitPrepared({
    root: input.root,
    project: input.project,
    artifactId: input.artifactId,
    expectedToken: input.expectedToken,
    prepare() {
      return { spec, scene, deprecatedAnchors: [] };
    }
  }, control);
}
// src/bootstrap.ts
var sourceReceiptName = "source.json";
function run(args) {
  const result = Bun.spawnSync([...args], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}
function readSourceMetadata(source) {
  const commit = readSourceRevision(source);
  if (commit === null)
    return { root: source, commit: null };
  if (run(["git", "-C", source, "status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw new InputError(`source git worktree is dirty: ${source}`);
  }
  return { root: source, commit };
}
function walkthroughSpec(source) {
  const base = parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId: "walkthrough-call-map",
    kind: "code-exploration",
    revision: 1,
    title: "Walkthrough Call Map",
    source,
    nodes: [
      {
        semanticId: "route",
        label: `OrdersRouter
\uC694\uCCAD \uC9C4\uC785\uC810`,
        status: "fact",
        evidence: [{ path: "src/routes/orders.ts", symbol: "OrdersRouter" }]
      },
      {
        semanticId: "service",
        label: `CheckoutService
\uC8FC\uBB38 \uCC98\uB9AC`,
        status: "fact",
        evidence: [{ path: "src/services/CheckoutService.ts", symbol: "CheckoutService" }]
      }
    ],
    edges: [
      {
        semanticId: "route-service",
        from: "route",
        to: "service",
        label: `submitOrder()
\uB77C\uC6B0\uD130\uAC00 \uC11C\uBE44\uC2A4 \uD638\uCD9C`,
        status: "fact",
        evidence: [{ path: "src/services/CheckoutService.ts", symbol: "submitOrder" }]
      }
    ]
  });
  return {
    create: base,
    extend: parseVisualNoteSpec({ ...base, revision: 2, title: "Walkthrough Call Map Extend" })
  };
}
function bootstrapReceipt(root, project, source, artifactCount, bundlePath, status) {
  return {
    operation: "bootstrap",
    project,
    source,
    artifactCount,
    bundlePath: bundlePath ?? null,
    walkthroughAssets: [
      `Engineering Atlas/10 Projects/${project}/_assets/walkthrough-create.json`,
      `Engineering Atlas/10 Projects/${project}/_assets/walkthrough-extend.json`,
      `Engineering Atlas/10 Projects/${project}/_assets/walkthrough-refresh-v2.json`
    ],
    publication: {
      status,
      targetProject: join10(root, "Engineering Atlas/10 Projects", project)
    }
  };
}
function bootstrapProject(input) {
  const root = ensureRealDirectory(input.root, "root");
  const source = ensureRealDirectory(input.source, "source");
  const metadata = readSourceMetadata(source);
  const current = currentProjectState({
    root,
    project: input.project,
    metadata,
    ...input.bundlePath === undefined ? {} : { bundlePath: input.bundlePath }
  });
  if (current !== null) {
    return bootstrapReceipt(root, input.project, metadata, current.artifactCount, input.bundlePath, "ALREADY_CURRENT");
  }
  const stageRoot = mkdtempSync(join10(tmpdir(), "visual-note-bootstrap-"));
  try {
    const base = join10(stageRoot, "Engineering Atlas/10 Projects", input.project);
    for (const relativePath of [
      "01 Architecture",
      "02 ADR",
      "03 API",
      "04 Workflows",
      "05 Study Notes",
      "_generated/specs",
      "_generated/drawings",
      "_history",
      "_assets"
    ]) {
      mkdirSync6(join10(base, relativePath), { recursive: true });
    }
    writeFileSync5(join10(base, "_generated/specs", sourceReceiptName), jsonBytes({ schemaVersion: 1, source: metadata }));
    const specs = [];
    if (input.bundlePath !== undefined) {
      const bundle = parseTemplateBundle(readJson(input.bundlePath));
      const generated = generateTemplateBundle(bundle, source);
      for (const view of generated.views) {
        const spec = parseVisualNoteSpec({ ...view.spec, source: metadata });
        specs.push(spec);
        bootstrapTransaction({
          root: stageRoot,
          project: input.project,
          spec,
          scene: sceneFromSpec(spec, "sample-bootstrap")
        });
      }
    }
    const walkthrough = walkthroughSpec(metadata);
    const refreshBase = specs.find((spec) => spec.kind === "project-map") ?? walkthrough.create;
    writeFileSync5(join10(base, "_assets/walkthrough-create.json"), jsonBytes(walkthrough.create));
    writeFileSync5(join10(base, "_assets/walkthrough-extend.json"), jsonBytes(walkthrough.extend));
    writeFileSync5(join10(base, "_assets/walkthrough-refresh-v2.json"), jsonBytes(parseVisualNoteSpec({
      ...refreshBase,
      revision: refreshBase.revision + 1,
      title: `${refreshBase.title} (Refresh)`
    })));
    writeProjectNotes(stageRoot, input.project, metadata, specs, refreshBase.artifactId);
    publishProjectDirectory(join10(stageRoot, "Engineering Atlas/10 Projects", input.project), join10(root, "Engineering Atlas/10 Projects", input.project));
    return bootstrapReceipt(root, input.project, metadata, specs.length, input.bundlePath, "CREATED");
  } finally {
    rmSync4(stageRoot, { recursive: true, force: true });
  }
}

// src/refresh.ts
import {
  closeSync as closeSync3,
  lstatSync as lstatSync6,
  mkdirSync as mkdirSync7,
  openSync as openSync3,
  readFileSync as readFileSync11,
  renameSync as renameSync3,
  unlinkSync as unlinkSync2,
  writeFileSync as writeFileSync6
} from "fs";
import { dirname as dirname8, join as join11 } from "path";
function statePath(root, project, artifactId) {
  return join11(root, artifactPaths(project, artifactId).drawingFolder, `${artifactId}.refresh-state.json`);
}
function lockPath(root, project, artifactId) {
  return join11(root, artifactPaths(project, artifactId).drawingFolder, `${artifactId}.refresh.lock`);
}
function readState2(path) {
  try {
    const parsed = JSON.parse(readFileSync11(path, "utf8"));
    if (typeof parsed === "object" && parsed !== null && typeof parsed.currentToken === "string" && typeof parsed.lastIssued === "number") {
      return parsed;
    }
  } catch {}
  return { currentToken: "cas-0", lastIssued: 0 };
}
function writeAtomic(path, bytes) {
  mkdirSync7(dirname8(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync6(temporary, bytes);
  renameSync3(temporary, path);
}
function refreshArtifact(input) {
  if (!lstatSync6(input.root).isDirectory())
    throw new InputError("root must be a directory");
  const paths = artifactPaths(input.project, input.spec.artifactId);
  const drawingPath = join11(input.root, paths.drawing);
  const lock = lockPath(input.root, input.project, input.spec.artifactId);
  let descriptor = -1;
  try {
    descriptor = openSync3(lock, "wx");
  } catch {
    throw new ConflictError(`refresh conflict: ${input.spec.artifactId}`);
  }
  try {
    const stateFile = statePath(input.root, input.project, input.spec.artifactId);
    const state = readState2(stateFile);
    if (state.currentToken !== input.expectedToken)
      throw new ConflictError(`refresh conflict: expected ${input.expectedToken}`);
    const current = parseSceneMarkdown(readFileSync11(drawingPath, "utf8")).scene;
    const { scene: finalScene, deprecatedAnchors } = applyRefreshToScene(current, input.spec);
    const nextToken = `cas-${state.lastIssued + 1}`;
    writeAtomic(drawingPath, encodeSceneToMarkdown(finalScene));
    writeAtomic(join11(input.root, paths.spec), jsonBytes(input.spec));
    writeAtomic(join11(input.root, paths.note), noteBytes(input.spec, paths.drawing, paths.svg, deprecatedAnchors));
    writeAtomic(stateFile, `${JSON.stringify({ currentToken: nextToken, lastIssued: state.lastIssued + 1 }, null, 2)}
`);
    return { operation: "refresh", token: nextToken, deprecatedAnchors };
  } finally {
    if (descriptor >= 0)
      closeSync3(descriptor);
    try {
      unlinkSync2(lock);
    } catch {}
  }
}

// src/safe-path.ts
import { isAbsolute as isAbsolute5, normalize as normalize4 } from "path";
var helper = new URL("../scripts/internal/safe-fs.py", import.meta.url).pathname;
function assertRoot(root) {
  if (!isAbsolute5(root) || root === "/" || normalize4(root) !== root) {
    throw new InputError("root must be a normalized absolute non-root path");
  }
}
function assertRelative(relativePath) {
  if (relativePath.length === 0 || isAbsolute5(relativePath) || normalize4(relativePath) !== relativePath || relativePath.includes("\\") || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new InputError(`unsafe relative path: ${relativePath}`);
  }
}
function runSafeFs(command, root, relativePath, bytes) {
  assertRoot(root);
  assertRelative(relativePath);
  const result = Bun.spawnSync(["/usr/bin/python3", helper, command, root, relativePath], {
    stdin: bytes === undefined ? undefined : Buffer.from(bytes),
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode === 0)
    return;
  const detail = result.stderr.toString().trim();
  if (detail.includes("target collision"))
    throw new CollisionError(relativePath);
  throw new InputError(detail || `safe filesystem helper exited ${result.exitCode}`);
}
function safeCreateFile(root, relativePath, bytes) {
  runSafeFs("create", root, relativePath, bytes);
}
function safeMakeDirectories(root, relativePath) {
  runSafeFs("mkdirs", root, relativePath);
}

// src/operations.ts
var slugSchema = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
function checkedRoot(root) {
  return ensureRealDirectory(root, "root");
}
function projectBase(project) {
  return `Engineering Atlas/10 Projects/${slugSchema.parse(project)}`;
}
function validateSpec(path) {
  const spec = parseVisualNoteSpec(readJson(path));
  const bytes = jsonBytes(spec);
  return { spec, sha256: sha256(bytes) };
}
function initializeProject(input) {
  const root = checkedRoot(input.root);
  const source = ensureRealDirectory(input.source, "source");
  const base = projectBase(input.project);
  const directories = [
    "01 Architecture",
    "02 ADR",
    "03 API",
    "04 Workflows",
    "05 Study Notes",
    "_generated/drawings",
    "_history",
    "_assets"
  ];
  const metadata = {
    schemaVersion: 1,
    source: { root: source, commit: readSourceRevision(source) }
  };
  safeMakeDirectories(root, `${base}/_generated/specs`);
  safeCreateFile(root, `${base}/_generated/specs/source.json`, jsonBytes(metadata));
  for (const directory of directories)
    safeMakeDirectories(root, `${base}/${directory}`);
  return { operation: "init", project: input.project, ...metadata };
}
function bootstrapSample(input) {
  projectBase(input.project);
  return bootstrapProject(input);
}
function createSpec(input) {
  const validated = validateSpec(input.specPath);
  const root = checkedRoot(input.root);
  const base = projectBase(input.project);
  safeMakeDirectories(root, `${base}/_generated/specs`);
  const relativePath = `${base}/_generated/specs/${validated.spec.artifactId}.json`;
  safeCreateFile(root, relativePath, jsonBytes(validated.spec));
  return {
    operation: "create",
    artifactId: validated.spec.artifactId,
    revision: validated.spec.revision,
    relativePath,
    specSha256: validated.sha256
  };
}
function inspectSpec(operation, specPath) {
  const validated = validateSpec(specPath);
  return {
    operation,
    contractDepth: 4,
    mutation: "deferred-to-renderer-transaction-todos",
    artifactId: validated.spec.artifactId,
    revision: validated.spec.revision,
    specSha256: validated.sha256
  };
}
function refreshSpec(input) {
  const validated = validateSpec(input.specPath);
  const root = checkedRoot(input.root);
  projectBase(input.project);
  const txPaths = transactionPaths(root, input.project, validated.spec.artifactId);
  const result = existsSync8(txPaths.statePath) ? refreshTransaction({
    root,
    project: input.project,
    spec: validated.spec,
    expectedToken: input.expectedToken
  }) : refreshArtifact({
    root,
    project: input.project,
    spec: validated.spec,
    expectedToken: input.expectedToken
  });
  return { artifactId: validated.spec.artifactId, revision: validated.spec.revision, ...result };
}
function restoreArtifact(input) {
  const root = checkedRoot(input.root);
  projectBase(input.project);
  return {
    operation: "restore",
    artifactId: input.artifactId,
    ...restoreTransaction({
      root,
      project: input.project,
      artifactId: input.artifactId,
      revisionToken: input.revisionToken,
      expectedToken: input.expectedToken
    })
  };
}

// src/cli-spec.ts
function runSpecCommand(command, argv) {
  const allowed = command === "refresh" ? new Set(["--spec", "--root", "--project", "--expected-token"]) : command === "restore" ? new Set([
    "--spec",
    "--root",
    "--project",
    "--artifact-id",
    "--revision-token",
    "--expected-token"
  ]) : new Set(["--spec"]);
  const options = parseOptions(argv, allowed);
  const mutatingRefresh = command === "refresh" && optional2(options, "--root") !== undefined && optional2(options, "--project") !== undefined && optional2(options, "--expected-token") !== undefined;
  const mutatingRestore = command === "restore" && optional2(options, "--root") !== undefined && optional2(options, "--project") !== undefined && optional2(options, "--artifact-id") !== undefined && optional2(options, "--revision-token") !== undefined && optional2(options, "--expected-token") !== undefined;
  const result = mutatingRefresh ? refreshSpec({
    root: required2(options, "--root"),
    project: required2(options, "--project"),
    specPath: required2(options, "--spec"),
    expectedToken: required2(options, "--expected-token")
  }) : mutatingRestore ? restoreArtifact({
    root: required2(options, "--root"),
    project: required2(options, "--project"),
    artifactId: required2(options, "--artifact-id"),
    revisionToken: required2(options, "--revision-token"),
    expectedToken: required2(options, "--expected-token")
  }) : inspectSpec(command, required2(options, "--spec"));
  writeResult(result, options.json);
}

// src/interactive-authoring-schema.ts
import { isAbsolute as isAbsolute6, normalize as normalize5 } from "path";

// src/interactive-authoring-validation.ts
function addIssue(context, path, code, message) {
  context.addIssue({ code: "custom", path, message: `[${code}] ${message}` });
}
function graphemeCount(value) {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
  }
  return [...value].length;
}
function checkUniqueExact(actual, expected, path, label, context) {
  const duplicate = actual.find((id, index) => actual.indexOf(id) !== index);
  if (duplicate !== undefined)
    addIssue(context, path, "duplicate-order-id", `${label} repeats '${duplicate}'`);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((id) => !actualSet.has(id));
  const unknown = actual.filter((id) => !expectedSet.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    addIssue(context, path, "order-set-mismatch", `${label} must exactly match the present semantic set; missing=${missing.join(",") || "none"}; unknown=${unknown.join(",") || "none"}`);
  }
}
function checkCopy(value, maxGraphemes, maxLines, path, context) {
  const count = graphemeCount(value);
  if (count > maxGraphemes) {
    addIssue(context, path, "copy-budget", `${count} graphemes exceeds ${maxGraphemes}`);
  }
  const lines = value.split(/\r\n|\r|\n/u).length;
  if (lines > maxLines)
    addIssue(context, path, "line-budget", `${lines} explicit lines exceeds ${maxLines}`);
}
function checkFactEvidence(claim, path, context) {
  if (claim.status === "fact" && claim.evidence.length === 0) {
    addIssue(context, [...path, "evidence"], "fact-evidence-required", "fact claims require evidence");
  }
}
function checkUniqueEvidenceIds(evidence, path, context) {
  const ids = evidence.map((reference) => reference.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    addIssue(context, path, "duplicate-evidence-id", `evidence ID '${duplicate}' repeats`);
  }
}
function checkDetailEvidence(entity, path, context) {
  const duplicate = entity.details.evidenceIds.find((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    addIssue(context, [...path, "details", "evidenceIds"], "duplicate-detail-evidence-id", `detail evidence ID '${duplicate}' repeats`);
  }
  checkDetailEvidenceResolution(entity, path, [...path, "details", "evidenceIds"], context);
}
function checkDetailEvidenceResolution(entity, detailPath, issuePath, context) {
  const available = new Set(entity.evidence.map((reference) => reference.id));
  const unresolved = entity.details.evidenceIds.filter((id) => !available.has(id));
  if (unresolved.length > 0) {
    addIssue(context, issuePath, "unresolved-detail-evidence-id", `detail evidence IDs at ${detailPath.join(".")} must resolve against this entity evidence set: ${unresolved.join(",")}`);
  }
}
function checkDetailDimension(dimension, path, context) {
  const duplicate = dimension.identifiers.find((identifier, index, identifiers) => identifiers.indexOf(identifier) !== index);
  if (duplicate !== undefined) {
    addIssue(context, [...path, "identifiers"], "duplicate-detail-identifier", `identifier '${duplicate}' repeats`);
  }
  for (const identifier of dimension.identifiers) {
    if (!dimension.source.includes(identifier)) {
      addIssue(context, [...path, "source"], "detail-identifier-not-in-source", `canonical source must preserve identifier '${identifier}' exactly`);
    }
    for (const [level, projection] of Object.entries(dimension.projections)) {
      if (!projection.includes(identifier)) {
        addIssue(context, [...path, "projections", level], "detail-identifier-not-preserved", `${level} projection must preserve identifier '${identifier}' exactly`);
      }
    }
  }
  const beginnerLength = graphemeCount(dimension.projections.beginner);
  const intermediateLength = graphemeCount(dimension.projections.intermediate);
  const expertLength = graphemeCount(dimension.projections.expert);
  if (beginnerLength < intermediateLength || intermediateLength < expertLength) {
    addIssue(context, [...path, "projections"], "detail-projection-order", `projection lengths must satisfy beginner (${beginnerLength}) >= intermediate (${intermediateLength}) >= expert (${expertLength})`);
  }
}
function presentIds(baseline, patches) {
  return Object.keys(baseline).filter((id) => patches[id]?.present !== false);
}
function refinePhase(scene, phaseName, context) {
  const phase = scene.change[phaseName];
  const entities = scene.semantics.entities;
  const relations = scene.semantics.relations;
  for (const id of Object.keys(phase.entities)) {
    if (entities[id] === undefined) {
      addIssue(context, ["change", phaseName, "entities", id], "unknown-patch-id", "entity patch has no baseline entity");
    }
  }
  for (const id of Object.keys(phase.relations)) {
    if (relations[id] === undefined) {
      addIssue(context, ["change", phaseName, "relations", id], "unknown-patch-id", "relation patch has no baseline relation");
    }
  }
  const entityIds = presentIds(entities, phase.entities);
  const relationIds = presentIds(relations, phase.relations);
  checkUniqueExact(phase.entityOrder, entityIds, ["change", phaseName, "entityOrder"], "entity order", context);
  checkUniqueExact(phase.relationOrder, relationIds, ["change", phaseName, "relationOrder"], "relation order", context);
  const presentEntities = new Set(entityIds);
  for (const relationId of relationIds) {
    const baseline = relations[relationId];
    if (baseline === undefined)
      continue;
    const patch = phase.relations[relationId];
    const relation = {
      ...baseline,
      ...patch,
      from: patch?.from ?? baseline.from,
      to: patch?.to ?? baseline.to,
      status: patch?.status ?? baseline.status,
      evidence: patch?.evidence ?? baseline.evidence
    };
    if (!presentEntities.has(relation.from) || !presentEntities.has(relation.to)) {
      addIssue(context, ["change", phaseName, "relations", relationId], "dangling-phase-edge", `endpoints '${relation.from}' and '${relation.to}' must both be present`);
    }
    checkFactEvidence(relation, ["change", phaseName, "relations", relationId], context);
    checkUniqueEvidenceIds(relation.evidence, ["change", phaseName, "relations", relationId, "evidence"], context);
  }
  for (const entityId of entityIds) {
    const baseline = entities[entityId];
    if (baseline !== undefined) {
      const patch = phase.entities[entityId];
      const entity = {
        ...baseline,
        ...patch,
        status: patch?.status ?? baseline.status,
        evidence: patch?.evidence ?? baseline.evidence
      };
      const path = ["change", phaseName, "entities", entityId];
      checkFactEvidence(entity, path, context);
      checkUniqueEvidenceIds(entity.evidence, [...path, "evidence"], context);
      checkDetailEvidenceResolution(entity, ["semantics", "entities", entityId, "details", "evidenceIds"], [...path, "evidence"], context);
    }
  }
}
function refineInteractiveScene(scene, context) {
  const entityIds = Object.keys(scene.semantics.entities);
  const relationIds = Object.keys(scene.semantics.relations);
  const collisions = entityIds.filter((id) => relationIds.includes(id));
  if (collisions.length > 0) {
    addIssue(context, ["semantics"], "duplicate-semantic-id", `entity and relation IDs overlap: ${collisions.join(",")}`);
  }
  checkUniqueExact(scene.story.readingOrder, entityIds, ["story", "readingOrder"], "reading order", context);
  for (const [id, entity] of Object.entries(scene.semantics.entities)) {
    checkFactEvidence(entity, ["semantics", "entities", id], context);
    checkUniqueEvidenceIds(entity.evidence, ["semantics", "entities", id, "evidence"], context);
    checkDetailEvidence(entity, ["semantics", "entities", id], context);
  }
  for (const [id, relation] of Object.entries(scene.semantics.relations)) {
    if (scene.semantics.entities[relation.from] === undefined || scene.semantics.entities[relation.to] === undefined) {
      addIssue(context, ["semantics", "relations", id], "dangling-baseline-edge", "baseline endpoints must exist");
    }
    checkFactEvidence(relation, ["semantics", "relations", id], context);
    checkUniqueEvidenceIds(relation.evidence, ["semantics", "relations", id, "evidence"], context);
  }
  refinePhase(scene, "before", context);
  refinePhase(scene, "after", context);
  const laneIds = scene.presentation.lanes.map((lane) => lane.id);
  const duplicateLane = laneIds.find((id, index) => laneIds.indexOf(id) !== index);
  if (duplicateLane !== undefined)
    addIssue(context, ["presentation", "lanes"], "duplicate-lane-id", `lane '${duplicateLane}' repeats`);
  checkUniqueExact(Object.keys(scene.presentation.placements), entityIds, ["presentation", "placements"], "placement coverage", context);
  for (const [id, placement] of Object.entries(scene.presentation.placements)) {
    if (!laneIds.includes(placement.lane)) {
      addIssue(context, ["presentation", "placements", id, "lane"], "unknown-lane", `lane '${placement.lane}' is not declared`);
    }
  }
  for (const relationId of Object.keys(scene.presentation.edgeRouting.relations ?? {})) {
    if (!relationIds.includes(relationId)) {
      addIssue(context, ["presentation", "edgeRouting", "relations", relationId], "unknown-routing-relation", "routing override has no baseline relation");
    }
  }
  const { copy, nodeSizing, typography } = scene.constraints;
  if (nodeSizing.minWidth > nodeSizing.maxWidth) {
    addIssue(context, ["constraints", "nodeSizing"], "invalid-node-width-range", "minWidth must not exceed maxWidth");
  }
  if (copy.detailExpertMaxGraphemes > copy.detailIntermediateMaxGraphemes || copy.detailIntermediateMaxGraphemes > copy.detailBeginnerMaxGraphemes) {
    addIssue(context, ["constraints", "copy"], "invalid-projection-grapheme-budgets", "detail grapheme budgets must satisfy expert <= intermediate <= beginner");
  }
  if (copy.detailExpertMaxLines > copy.detailIntermediateMaxLines || copy.detailIntermediateMaxLines > copy.detailBeginnerMaxLines) {
    addIssue(context, ["constraints", "copy"], "invalid-projection-line-budgets", "detail line budgets must satisfy expert <= intermediate <= beginner");
  }
  const minimumZoom = scene.constraints.layout.minimumZoom;
  const transformedText = [
    ["nodeTitleMinPx", typography.nodeTitleMinPx],
    ["nodeBodyMinPx", typography.nodeBodyMinPx],
    ["edgeLabelMinPx", typography.edgeLabelMinPx]
  ];
  const untransformedText = [
    ["uiMetadataMinPx", typography.uiMetadataMinPx],
    ["detailTextMinPx", typography.detailTextMinPx]
  ];
  for (const [field, nominalSize] of transformedText) {
    const effectiveSize = nominalSize * minimumZoom;
    if (effectiveSize < typography.minimumEffectiveTextPx) {
      addIssue(context, ["constraints", "typography", field], "effective-text-floor", `${nominalSize}px at minimum zoom ${minimumZoom} becomes ${effectiveSize.toFixed(2)}px; require at least ${typography.minimumEffectiveTextPx}px`);
    }
  }
  for (const [field, nominalSize] of untransformedText) {
    if (nominalSize < typography.minimumEffectiveTextPx) {
      addIssue(context, ["constraints", "typography", field], "effective-text-floor", `${nominalSize}px outside the transformed canvas must remain at least ${typography.minimumEffectiveTextPx}px`);
    }
  }
  checkCopy(scene.story.question, copy.storyQuestionMaxGraphemes, copy.storyQuestionMaxLines, ["story", "question"], context);
  checkCopy(scene.story.summary, copy.storySummaryMaxGraphemes, copy.storySummaryMaxLines, ["story", "summary"], context);
  checkCopy(scene.story.takeaway, copy.storyTakeawayMaxGraphemes, copy.storyTakeawayMaxLines, ["story", "takeaway"], context);
  for (const [id, entity] of Object.entries(scene.semantics.entities)) {
    checkCopy(entity.title, copy.titleMaxGraphemes, copy.titleMaxLines, ["semantics", "entities", id, "title"], context);
    checkCopy(entity.description, copy.descriptionMaxGraphemes, copy.descriptionMaxLines, ["semantics", "entities", id, "description"], context);
    if (entity.badge !== undefined && entity.badge !== null) {
      checkCopy(entity.badge, copy.badgeMaxGraphemes, copy.badgeMaxLines, ["semantics", "entities", id, "badge"], context);
    }
    for (const field of ["role", "before", "after", "reason", "impact"]) {
      const dimension = entity.details[field];
      const path = ["semantics", "entities", id, "details", field];
      checkDetailDimension(dimension, path, context);
      checkCopy(dimension.source, copy.detailSourceMaxGraphemes, copy.detailSourceMaxLines, [...path, "source"], context);
      checkCopy(dimension.projections.beginner, copy.detailBeginnerMaxGraphemes, copy.detailBeginnerMaxLines, [...path, "projections", "beginner"], context);
      checkCopy(dimension.projections.intermediate, copy.detailIntermediateMaxGraphemes, copy.detailIntermediateMaxLines, [...path, "projections", "intermediate"], context);
      checkCopy(dimension.projections.expert, copy.detailExpertMaxGraphemes, copy.detailExpertMaxLines, [...path, "projections", "expert"], context);
    }
  }
  for (const [id, relation] of Object.entries(scene.semantics.relations)) {
    checkCopy(relation.label, copy.edgeLabelMaxGraphemes, copy.edgeLabelMaxLines, ["semantics", "relations", id, "label"], context);
  }
  for (const phaseName of ["before", "after"]) {
    for (const [id, patch] of Object.entries(scene.change[phaseName].entities)) {
      if (patch.title !== undefined)
        checkCopy(patch.title, copy.titleMaxGraphemes, copy.titleMaxLines, ["change", phaseName, "entities", id, "title"], context);
      if (patch.description !== undefined)
        checkCopy(patch.description, copy.descriptionMaxGraphemes, copy.descriptionMaxLines, ["change", phaseName, "entities", id, "description"], context);
      if (patch.badge !== undefined && patch.badge !== null)
        checkCopy(patch.badge, copy.badgeMaxGraphemes, copy.badgeMaxLines, ["change", phaseName, "entities", id, "badge"], context);
    }
    for (const [id, patch] of Object.entries(scene.change[phaseName].relations)) {
      if (patch.label !== undefined)
        checkCopy(patch.label, copy.edgeLabelMaxGraphemes, copy.edgeLabelMaxLines, ["change", phaseName, "relations", id, "label"], context);
    }
  }
}

// src/interactive-authoring-schema.ts
var identifierSchema = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
var commitSchema = string2().regex(/^[0-9a-f]{7,64}$/);
var confidenceSchema2 = _enum(["high", "medium", "low", "unknown"]);
var changeStatusSchema = _enum([
  "normal",
  "added",
  "removed",
  "changed",
  "blocked",
  "unchanged",
  "gap"
]);
var emphasisSchema = _enum(["primary", "secondary", "warning", "muted"]);
var fallbackPlacementSchema = _enum([
  "top-corridor",
  "bottom-corridor",
  "source-side",
  "target-side",
  "detached-callout"
]);
var labelPlacementSchema = _enum(["auto-corridor", ...fallbackPlacementSchema.options]);
var sourceRootSchema = string2().refine((value) => isAbsolute6(value) && normalize5(value) === value, "source root must be a normalized absolute path");
var identifiedEvidenceReferenceSchema = evidenceReferenceSchema.safeExtend({
  id: identifierSchema
});
var claimFields2 = {
  status: knowledgeStatusSchema,
  confidence: confidenceSchema2,
  evidence: array(identifiedEvidenceReferenceSchema)
};
var detailDimensionSchema = object({
  source: string2().trim().min(1),
  identifiers: array(string2().trim().min(1)),
  projections: object({
    beginner: string2().trim().min(1),
    intermediate: string2().trim().min(1),
    expert: string2().trim().min(1)
  }).strict()
}).strict();
var entityDetailsSchema = object({
  role: detailDimensionSchema,
  before: detailDimensionSchema,
  after: detailDimensionSchema,
  reason: detailDimensionSchema,
  impact: detailDimensionSchema,
  evidenceIds: array(identifierSchema).min(1)
}).strict();
var entityBaselineSchema = object({
  title: string2().trim().min(1),
  description: string2().trim().min(1),
  details: entityDetailsSchema,
  badge: string2().trim().min(1).nullable().optional(),
  changeStatus: changeStatusSchema,
  visual: object({
    category: visualCategorySchema,
    shape: _enum(["rectangle", "ellipse", "diamond"])
  }).strict(),
  ...claimFields2
}).strict();
var relationBaselineSchema = object({
  from: identifierSchema,
  to: identifierSchema,
  label: string2().trim().min(1),
  changeStatus: changeStatusSchema,
  animated: boolean2(),
  ...claimFields2
}).strict();
var entityPatchSchema = object({
  title: string2().trim().min(1).optional(),
  description: string2().trim().min(1).optional(),
  badge: string2().trim().min(1).nullable().optional(),
  changeStatus: changeStatusSchema.optional(),
  status: knowledgeStatusSchema.optional(),
  confidence: confidenceSchema2.optional(),
  evidence: array(identifiedEvidenceReferenceSchema).optional(),
  present: literal(false).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "entity patch must not be empty");
var relationPatchSchema = object({
  from: identifierSchema.optional(),
  to: identifierSchema.optional(),
  label: string2().trim().min(1).optional(),
  changeStatus: changeStatusSchema.optional(),
  animated: boolean2().optional(),
  status: knowledgeStatusSchema.optional(),
  confidence: confidenceSchema2.optional(),
  evidence: array(identifiedEvidenceReferenceSchema).optional(),
  present: literal(false).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "relation patch must not be empty");
var phaseSchema = object({
  label: string2().trim().min(1),
  entities: record(identifierSchema, entityPatchSchema),
  relations: record(identifierSchema, relationPatchSchema),
  entityOrder: array(identifierSchema).min(1),
  relationOrder: array(identifierSchema)
}).strict();
var copyConstraintsSchema = object({
  storyQuestionMaxGraphemes: number2().int().positive(),
  storySummaryMaxGraphemes: number2().int().positive(),
  storyTakeawayMaxGraphemes: number2().int().positive(),
  titleMaxGraphemes: number2().int().positive(),
  descriptionMaxGraphemes: number2().int().positive(),
  badgeMaxGraphemes: number2().int().positive(),
  edgeLabelMaxGraphemes: number2().int().positive(),
  detailSourceMaxGraphemes: number2().int().positive(),
  detailBeginnerMaxGraphemes: number2().int().positive(),
  detailIntermediateMaxGraphemes: number2().int().positive(),
  detailExpertMaxGraphemes: number2().int().positive(),
  storyQuestionMaxLines: number2().int().positive(),
  storySummaryMaxLines: number2().int().positive(),
  storyTakeawayMaxLines: number2().int().positive(),
  titleMaxLines: number2().int().positive(),
  descriptionMaxLines: number2().int().positive(),
  badgeMaxLines: number2().int().positive(),
  edgeLabelMaxLines: number2().int().positive(),
  detailSourceMaxLines: number2().int().positive(),
  detailBeginnerMaxLines: number2().int().positive(),
  detailIntermediateMaxLines: number2().int().positive(),
  detailExpertMaxLines: number2().int().positive()
}).strict();
var interactionSchema = object({
  detailLevel: object({
    options: tuple([literal("beginner"), literal("intermediate"), literal("expert")]),
    default: _enum(["beginner", "intermediate", "expert"]),
    accessibleLabel: string2().trim().min(1)
  }).strict(),
  canonicalSource: object({
    available: literal(true),
    accessibleLabel: string2().trim().min(1)
  }).strict(),
  fontScale: object({
    minimumPercent: literal(100),
    maximumPercent: literal(150),
    defaultPercent: literal(100),
    stepPercent: literal(5),
    accessibleLabel: string2().trim().min(1)
  }).strict()
}).strict();
var interactiveSceneBaseSchema = object({
  semanticId: identifierSchema,
  kind: _enum(visualKindValues),
  story: object({
    question: string2().trim().min(1),
    summary: string2().trim().min(1),
    takeaway: string2().trim().min(1),
    readingOrder: array(identifierSchema).min(1)
  }).strict(),
  semantics: object({
    entities: record(identifierSchema, entityBaselineSchema),
    relations: record(identifierSchema, relationBaselineSchema)
  }).strict(),
  change: object({ before: phaseSchema, after: phaseSchema }).strict(),
  presentation: object({
    layout: _enum(["layered", "frames", "timeline", "hub", "trust-boundary", "lanes"]),
    readingGuide: string2().trim().min(1),
    outcome: string2().trim().min(1),
    lanes: array(object({
      id: identifierSchema,
      label: string2().trim().min(1),
      purpose: string2().trim().min(1)
    }).strict()).min(1),
    placements: record(identifierSchema, object({
      column: number2().int().nonnegative(),
      lane: identifierSchema,
      order: number2().int().nonnegative(),
      role: string2().trim().min(1),
      emphasis: emphasisSchema
    }).strict()),
    edgeRouting: object({
      defaultLabelPlacement: literal("auto-corridor"),
      fallback: array(fallbackPlacementSchema).min(1),
      relations: record(identifierSchema, object({
        labelPlacement: labelPlacementSchema.optional(),
        fallback: array(fallbackPlacementSchema).min(1).optional()
      }).strict().refine((value) => Object.keys(value).length > 0, "routing override must not be empty")).optional()
    }).strict()
  }).strict(),
  constraints: object({
    viewport: object({ width: number2().int().positive(), height: number2().int().positive() }).strict(),
    nodeSizing: object({
      aspectRatio: literal(1.5),
      minWidth: number2().int().positive(),
      maxWidth: number2().int().positive(),
      widthStep: number2().int().positive()
    }).strict(),
    layout: object({
      maxColumns: number2().int().positive(),
      maxNodesPerColumn: number2().int().positive(),
      minimumZoom: number2().positive().max(1),
      columnGap: number2().int().nonnegative(),
      rowGap: number2().int().nonnegative(),
      laneGap: number2().int().nonnegative(),
      minimumCorridor: number2().int().nonnegative()
    }).strict(),
    copy: copyConstraintsSchema,
    typography: object({
      nodeTitleMinPx: number2().min(24),
      nodeBodyMinPx: number2().min(20),
      edgeLabelMinPx: number2().min(20),
      uiMetadataMinPx: number2().min(20),
      detailTextMinPx: number2().min(20),
      minimumEffectiveTextPx: number2().min(14)
    }).strict()
  }).strict()
}).strict();
var interactiveSceneSchema = interactiveSceneBaseSchema.superRefine(refineInteractiveScene);
var interactiveAuthoringDocumentSchema = object({
  contractVersion: literal(2),
  direction: literal("left-to-right"),
  interaction: interactionSchema,
  source: object({
    root: sourceRootSchema,
    before: object({ commit: commitSchema, label: string2().trim().min(1) }).strict(),
    after: object({ commit: commitSchema, label: string2().trim().min(1) }).strict()
  }).strict(),
  scenes: array(interactiveSceneSchema).min(1)
}).strict().superRefine((document, context) => {
  const ids = document.scenes.map((scene) => scene.semanticId);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["scenes"],
      message: `[duplicate-scene-id] scene '${duplicate}' repeats`
    });
  }
});
function parseInteractiveAuthoringDocument(input) {
  return interactiveAuthoringDocumentSchema.parse(input);
}
function interactiveAuthoringJsonSchema() {
  return toJSONSchema(interactiveAuthoringDocumentSchema, { target: "draft-2020-12" });
}

// src/interactive-authoring-compiler.ts
function graphemes(value) {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((segment) => segment.segment);
  }
  return [...value];
}
function estimateNodeWidth(scene, entity) {
  const { minWidth, maxWidth, widthStep } = scene.constraints.nodeSizing;
  const maxFontScale = 1.5;
  const titleDemand = graphemes(entity.title).length * (scene.constraints.typography.nodeTitleMinPx / 24) * maxFontScale;
  const descriptionDemand = Math.ceil(graphemes(entity.description).length / 2) * (scene.constraints.typography.nodeBodyMinPx / 20) * maxFontScale;
  const badgeDemand = graphemes(entity.badge ?? "").length * (scene.constraints.typography.nodeBodyMinPx / 20) * maxFontScale;
  const demand = Math.max(titleDemand, descriptionDemand, badgeDemand);
  const steps = Math.max(0, Math.ceil((demand - 24) / 18));
  return Math.min(maxWidth, Math.max(minWidth, minWidth + steps * widthStep));
}
function mergeEntity(scene, phase, id) {
  const baseline = scene.semantics.entities[id];
  if (baseline === undefined)
    return;
  const patch = scene.change[phase].entities[id];
  if (patch?.present === false)
    return;
  const merged = { ...baseline, ...patch };
  if (merged.badge === null)
    delete merged.badge;
  return merged;
}
function mergeRelation(scene, phase, id) {
  const baseline = scene.semantics.relations[id];
  if (baseline === undefined)
    return;
  const patch = scene.change[phase].relations[id];
  if (patch?.present === false)
    return;
  return { ...baseline, ...patch };
}
function compileNode(scene, phase, id) {
  const entity = mergeEntity(scene, phase, id);
  if (entity === undefined)
    return;
  const estimatedWidth = estimateNodeWidth(scene, entity);
  const result = {
    id,
    title: entity.title,
    description: entity.description,
    details: structuredClone(entity.details),
    changeStatus: entity.changeStatus,
    visual: entity.visual,
    status: entity.status,
    confidence: entity.confidence,
    evidence: structuredClone(entity.evidence),
    estimatedWidth,
    estimatedHeight: estimatedWidth / scene.constraints.nodeSizing.aspectRatio
  };
  if (entity.badge !== undefined && entity.badge !== null)
    return { ...result, badge: entity.badge };
  return result;
}
function estimateLabelWidth(label, fontSizePx) {
  const width = graphemes(label).reduce((total, value) => total + (/^[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af]$/u.test(value) ? fontSizePx : fontSizePx * 0.56), 0);
  return Math.ceil(width + 16);
}
function estimateLabelHeight(label, fontSizePx, maxLineWidth) {
  const contentWidth = Math.max(1, maxLineWidth - 16);
  const visualLines = label.split(/\r\n|\r|\n/u).reduce((total, line) => total + Math.max(1, Math.ceil((estimateLabelWidth(line, fontSizePx) - 16) / contentWidth)), 0);
  return Math.ceil(visualLines * fontSizePx * 1.2 + 16);
}
function fallbackResolves(placement, available, required, scene) {
  if (placement === "detached-callout")
    return true;
  if (placement === "source-side" || placement === "target-side") {
    return Math.max(scene.constraints.layout.rowGap, scene.constraints.layout.laneGap) >= required;
  }
  return available >= required;
}
function phaseGeometry(scene, nodes) {
  const placements = scene.presentation.placements;
  const activePlacements = nodes.map((node) => ({ node, placement: placements[node.id] }));
  const columns = activePlacements.length === 0 ? 0 : Math.max(...activePlacements.map(({ placement }) => placement?.column ?? 0)) + 1;
  const columnWidths = Array.from({ length: columns }, () => 0);
  const columnHeights = Array.from({ length: columns }, () => 0);
  const columnCounts = Array.from({ length: columns }, () => 0);
  const laneOrder = new Map(scene.presentation.lanes.map((lane, index) => [lane.id, index]));
  for (let column = 0;column < columns; column += 1) {
    const entries = activePlacements.filter(({ placement }) => placement?.column === column).sort((left, right) => (laneOrder.get(left.placement?.lane ?? "") ?? 0) - (laneOrder.get(right.placement?.lane ?? "") ?? 0) || (left.placement?.order ?? 0) - (right.placement?.order ?? 0));
    columnCounts[column] = entries.length;
    let previousLane;
    entries.forEach(({ node, placement }, index) => {
      columnWidths[column] = Math.max(columnWidths[column] ?? 0, node.estimatedWidth);
      if (index > 0) {
        columnHeights[column] = (columnHeights[column] ?? 0) + (previousLane === placement?.lane ? scene.constraints.layout.rowGap : scene.constraints.layout.laneGap);
      }
      columnHeights[column] = (columnHeights[column] ?? 0) + node.estimatedHeight;
      previousLane = placement?.lane;
    });
  }
  const estimatedWidth = columnWidths.reduce((total, width) => total + width, 0) + Math.max(0, columns - 1) * scene.constraints.layout.columnGap;
  const estimatedHeight = Math.max(0, ...columnHeights);
  const estimatedZoom = estimatedWidth > 0 && estimatedHeight > 0 ? Math.min(1, scene.constraints.viewport.width / estimatedWidth, scene.constraints.viewport.height / estimatedHeight) : 1;
  return {
    estimatedWidth,
    estimatedHeight,
    estimatedZoom,
    columns,
    maxNodesPerColumn: Math.max(0, ...columnCounts)
  };
}
function effectiveTypography(scene, zoom) {
  const typography = scene.constraints.typography;
  return {
    zoom,
    nodeTitlePx: typography.nodeTitleMinPx * zoom,
    nodeBodyPx: typography.nodeBodyMinPx * zoom,
    edgeLabelPx: typography.edgeLabelMinPx * zoom,
    uiMetadataPx: typography.uiMetadataMinPx,
    detailTextPx: typography.detailTextMinPx,
    minimumRequiredPx: typography.minimumEffectiveTextPx,
    requiredCanvasZoom: Math.max(typography.minimumEffectiveTextPx / typography.nodeTitleMinPx, typography.minimumEffectiveTextPx / typography.nodeBodyMinPx, typography.minimumEffectiveTextPx / typography.edgeLabelMinPx)
  };
}
function compilePhase(scene, phase, failures) {
  const authored = scene.change[phase];
  const nodes = authored.entityOrder.flatMap((id) => {
    const node = compileNode(scene, phase, id);
    return node === undefined ? [] : [node];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];
  const corridors = [];
  for (const id of authored.relationOrder) {
    const relation = mergeRelation(scene, phase, id);
    if (relation === undefined || !nodeIds.has(relation.from) || !nodeIds.has(relation.to))
      continue;
    const sourcePlacement = scene.presentation.placements[relation.from];
    const targetPlacement = scene.presentation.placements[relation.to];
    if (sourcePlacement === undefined || targetPlacement === undefined)
      continue;
    const horizontal = sourcePlacement.column !== targetPlacement.column;
    const available = horizontal ? scene.constraints.layout.columnGap : sourcePlacement.lane === targetPlacement.lane ? scene.constraints.layout.rowGap : scene.constraints.layout.laneGap;
    const labelFontSize = scene.constraints.typography.edgeLabelMinPx * 1.5;
    const required = Math.max(scene.constraints.layout.minimumCorridor, horizontal ? estimateLabelWidth(relation.label, labelFontSize) : estimateLabelHeight(relation.label, labelFontSize, scene.constraints.nodeSizing.minWidth));
    const directFits = available >= required;
    const override = scene.presentation.edgeRouting.relations?.[id];
    const fallbacks = override?.fallback ?? scene.presentation.edgeRouting.fallback;
    const requested = override?.labelPlacement ?? "auto-corridor";
    const requestedFallback = requested === "auto-corridor" ? undefined : requested;
    const resolvedBy = directFits ? undefined : requestedFallback !== undefined && fallbackResolves(requestedFallback, available, required, scene) ? requestedFallback : fallbacks.find((candidate) => fallbackResolves(candidate, available, required, scene));
    if (!directFits && resolvedBy === undefined) {
      failures.push(`${scene.semanticId}/${phase}/${id}: no declared edge-label fallback fits`);
    }
    corridors.push({
      relationId: id,
      required,
      available,
      directFits,
      ...resolvedBy === undefined ? {} : { resolvedBy }
    });
    edges.push({
      ...relation,
      id,
      source: relation.from,
      target: relation.to,
      labelPlacement: directFits ? "auto-corridor" : resolvedBy ?? "auto-corridor"
    });
  }
  const geometry = phaseGeometry(scene, nodes);
  if (geometry.columns > scene.constraints.layout.maxColumns) {
    failures.push(`${scene.semanticId}/${phase}: ${geometry.columns} columns exceeds ${scene.constraints.layout.maxColumns}`);
  }
  if (geometry.maxNodesPerColumn > scene.constraints.layout.maxNodesPerColumn) {
    failures.push(`${scene.semanticId}/${phase}: ${geometry.maxNodesPerColumn} nodes per column exceeds ${scene.constraints.layout.maxNodesPerColumn}`);
  }
  if (geometry.estimatedZoom < scene.constraints.layout.minimumZoom) {
    failures.push(`${scene.semanticId}/${phase}: estimated zoom ${geometry.estimatedZoom.toFixed(3)} is below ${scene.constraints.layout.minimumZoom}`);
  }
  return {
    label: authored.label,
    nodes,
    edges,
    feasibility: {
      ...geometry,
      effectiveTypography: effectiveTypography(scene, geometry.estimatedZoom),
      corridors
    }
  };
}
function compileScene(scene, failures) {
  return {
    id: scene.semanticId,
    kind: scene.kind,
    story: scene.story,
    presentation: scene.presentation,
    constraints: scene.constraints,
    before: compilePhase(scene, "before", failures),
    after: compilePhase(scene, "after", failures)
  };
}
function compileInteractiveAuthoringDocument(raw) {
  const document = parseInteractiveAuthoringDocument(raw);
  const failures = [];
  const scenes = document.scenes.map((scene) => compileScene(scene, failures));
  if (failures.length > 0) {
    throw new InputError(`interactive authoring feasibility failed:
- ${failures.join(`
- `)}`);
  }
  const warnings = document.scenes.flatMap((scene) => Object.entries(scene.semantics.entities).flatMap(([entityId, entity]) => ["role", "before", "after", "reason", "impact"].flatMap((dimension) => entity.details[dimension].identifiers.length === 0 ? [
    `${scene.semanticId}/${entityId}/details/${dimension}: empty identifiers is an author assertion that no exact identifier applies`
  ] : [])));
  return {
    contractVersion: 2,
    direction: "left-to-right",
    source: document.source,
    interaction: structuredClone(document.interaction),
    scenes,
    warnings,
    measurementPolicy: {
      mode: "dom-final-correction",
      nodeAspectRatio: 1.5,
      sizing: "measure-content-then-clamp",
      edgeLabels: "route-after-node-measurement",
      typography: "enforce-authored-and-effective-text-floors",
      effectiveTextFormula: "nominal-css-px-times-transform-scale-times-font-scale",
      remeasureOn: [
        "fonts-ready",
        "phase-change",
        "detail-level-change",
        "font-scale-change",
        "container-resize"
      ],
      exactPixelsGuaranteed: false
    },
    interactionPolicy: {
      detailLevels: ["beginner", "intermediate", "expert"],
      canonicalSourceAvailable: true,
      fontScalePercent: { minimum: 100, maximum: 150 },
      preserveAcrossControls: [
        "node-and-edge-ids-and-order",
        "topology",
        "phase-state",
        "canonical-source",
        "identifiers",
        "evidence-ids"
      ],
      accessibility: {
        detailLevel: "radiogroup-with-arrow-key-navigation",
        canonicalSource: "disclosure-with-aria-expanded",
        fontScale: "range-with-live-output"
      }
    }
  };
}

// src/learning-review.ts
var ROUTE_SUGGESTION_NODE_COUNT = 5;
var READABLE_FIGURE_WIDTH = 1600;
function questionRule(spec) {
  if (spec.learning !== undefined)
    return [];
  return [
    {
      rule: "LR01-question",
      severity: "warn",
      target: null,
      message: "state the one question this view answers and its evidence-faithful answer",
      basis: "STRONG: task-first figure selection (research reference R1)"
    }
  ];
}
function relationRule(spec) {
  return spec.edges.filter((edge) => edge.relation === undefined).map((edge) => ({
    rule: "LR02-edge-relation",
    severity: "warn",
    target: edge.semanticId,
    message: "declare what this arrow means: runtime-call, data-movement, state-transition, or static-reference",
    basis: "STRONG: explicit relation semantics (research reference R2)"
  }));
}
function routeRule(spec) {
  const route = spec.learning?.route ?? [];
  if (spec.nodes.length < ROUTE_SUGGESTION_NODE_COUNT || route.length > 0)
    return [];
  return [
    {
      rule: "LR03-route",
      severity: "info",
      target: null,
      message: `offer an optional numbered reading route with one explanation per element (${spec.nodes.length} nodes)`,
      basis: "PARTIAL (debate D-02, D-13): suggested, navigable route; not mandatory"
    }
  ];
}
function scopeRule(spec) {
  if (spec.learning === undefined || (spec.learning.scope?.omits.length ?? 0) > 0)
    return [];
  const trustBoundary = spec.kind === "trust-boundary";
  return [
    {
      rule: "LR04-scope-omits",
      severity: trustBoundary ? "warn" : "info",
      target: null,
      message: trustBoundary ? "a trust-boundary view is one threat-model view; list the threats, attacker capabilities, and mitigations it does not model" : "list what this view deliberately leaves out",
      basis: trustBoundary ? "SUPPORTED (debate D-16): DFD is a scoped view, not a complete threat model" : "STRONG as documentation practice (research reference R4); trust-calibration effect UNRESOLVED (debate E-11)"
    }
  ];
}
function verifyRule(spec) {
  if (spec.learning === undefined)
    return [];
  const verified = new Set(spec.learning.verify.map((step) => step.semanticId));
  const routed = new Set(spec.learning.route.map((step) => step.semanticId));
  return [...spec.nodes, ...spec.edges].filter((claim) => claim.status === "fact" && routed.has(claim.semanticId) && !verified.has(claim.semanticId)).map((claim) => ({
    rule: "LR05-verify",
    severity: "info",
    target: claim.semanticId,
    message: "give the reader a concrete way to check this routed fact (file, test, command)",
    basis: "product rule from learner profile T-1/T-8; provenance, not a learning claim (D-10)"
  }));
}
function questionStatusRule(spec) {
  if (spec.learning === undefined)
    return [];
  const routed = new Set(spec.learning.route.map((step) => step.semanticId));
  return spec.nodes.filter((node) => node.status === "question" && routed.has(node.semanticId)).map((node) => ({
    rule: "LR06-open-question-on-route",
    severity: "info",
    target: node.semanticId,
    message: "the reading route passes an unverified question; say in the answer what it leaves open",
    basis: "learner profile bias: first framing hardens into fact"
  }));
}
function widthRule(spec) {
  const width = Math.max(0, ...planScene(spec).elements.map((element) => element.x + element.width));
  if (width <= READABLE_FIGURE_WIDTH)
    return [];
  return [
    {
      rule: "LR07-figure-width",
      severity: "warn",
      target: null,
      message: `the planned figure is ${Math.round(width)}px wide and will shrink below readable text size at note width; group nodes into presentation frames with the components layout (presentation.columns: 2 keeps it narrow), or split the view`,
      basis: "MODERATE: check the smallest rendered text at the intended viewing scale (research reference R10); learner profile T-5/T-10 readability"
    }
  ];
}
function reviewLearningSpec(path) {
  const spec = parseVisualNoteSpec(readJson(path));
  const findings = [
    ...questionRule(spec),
    ...relationRule(spec),
    ...routeRule(spec),
    ...scopeRule(spec),
    ...verifyRule(spec),
    ...questionStatusRule(spec),
    ...widthRule(spec)
  ];
  return {
    operation: "review-learning",
    artifactId: spec.artifactId,
    hasLearningLayer: spec.learning !== undefined,
    counts: {
      warn: findings.filter((finding) => finding.severity === "warn").length,
      info: findings.filter((finding) => finding.severity === "info").length
    },
    findings
  };
}

// src/remote-client.ts
import { lstatSync as lstatSync7, readFileSync as readFileSync13, realpathSync as realpathSync3 } from "fs";
import { join as join13, resolve as resolve4, sep as sep3 } from "path";

// src/remote-payload.ts
import { existsSync as existsSync9, readdirSync as readdirSync4, readFileSync as readFileSync12, realpathSync, statSync } from "fs";
import { basename as basename3, join as join12, resolve as resolve2 } from "path";
var slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var manifestSchema = object({
  artifacts: array(object({ artifactId: string2().regex(slug) }))
});
var leakPattern = /\/Users\/|\/home\/|\/private\/var\//;
function isDirectory(path) {
  return existsSync9(path) && statSync(path).isDirectory();
}
function readText(root, relativePath, label) {
  const path = join12(root, relativePath);
  if (!existsSync9(path))
    throw new InputError(`missing ${label}: ${relativePath}`);
  return readFileSync12(path, "utf8");
}
function exportSeriesLayout(root, project) {
  const base = `docs/vl/projects/${project}`;
  if (!existsSync9(join12(root, base, "manifest.json")))
    return null;
  let manifest;
  try {
    manifest = JSON.parse(readText(root, `${base}/manifest.json`, "manifest"));
  } catch (error) {
    throw new InputError(`malformed manifest JSON: ${base}/manifest.json`, { cause: error });
  }
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success)
    throw new InputError(`invalid manifest: ${base}/manifest.json`);
  return {
    name: "export-series",
    artifactIds: parsed.data.artifacts.map((artifact) => artifact.artifactId),
    files: (artifactId) => ({
      spec: `${base}/specs/${artifactId}.json`,
      drawing: `${base}/${artifactId}.excalidraw.md`
    })
  };
}
function transactionalLayout(root, project) {
  const specFolder = join12(root, artifactPaths(project, "x").base, "_generated", "specs");
  if (!isDirectory(specFolder))
    return null;
  const artifactIds = readdirSync4(specFolder, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name.slice(0, -".json".length)).filter((artifactId) => slug.test(artifactId)).sort();
  return {
    name: "transactional",
    artifactIds,
    files: (artifactId) => {
      const paths = artifactPaths(project, artifactId);
      return { spec: paths.spec, drawing: paths.drawing };
    }
  };
}
function detectLayout(root, project) {
  const exported = exportSeriesLayout(root, project);
  const transactional = transactionalLayout(root, project);
  if (exported !== null && transactional !== null) {
    throw new InputError(`project ${project} exists in both the export-series and transactional layouts; publish from a root with one`);
  }
  const layout = exported ?? transactional;
  if (layout === null) {
    throw new InputError(`no atlas layout for project ${project}: expected docs/vl/projects/${project}/manifest.json or ${artifactPaths(project, "x").base}/_generated/specs/`);
  }
  return layout;
}
function readSpec(root, relativePath, artifactId) {
  let raw;
  try {
    raw = JSON.parse(readText(root, relativePath, "spec"));
  } catch (error) {
    if (error instanceof InputError)
      throw error;
    throw new InputError(`malformed spec JSON: ${relativePath}`, { cause: error });
  }
  let spec;
  try {
    spec = parseVisualNoteSpec(raw);
  } catch (error) {
    throw new InputError(`invalid spec: ${relativePath}`, { cause: error });
  }
  if (spec.artifactId !== artifactId) {
    throw new InputError(`spec artifactId ${spec.artifactId} does not match ${relativePath}`);
  }
  return spec;
}
function readScene2(root, relativePath) {
  const markdown = readText(root, relativePath, "drawing");
  try {
    return parseSceneMarkdown(markdown).scene;
  } catch (error) {
    const detail = error instanceof InputError ? error.detail : "malformed Excalidraw scene";
    throw new InputError(`${detail}: ${relativePath}`, { cause: error });
  }
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scrubber(replacements) {
  const rules = [...replacements.entries()].filter(([prefix]) => prefix.length > 1).sort(([left], [right]) => right.length - left.length);
  if (rules.length === 0)
    return (value) => value;
  const lookup = new Map(rules);
  const pattern = new RegExp(`(?:${rules.map(([prefix]) => escapeRegExp(prefix)).join("|")})(?![A-Za-z0-9._-])`, "g");
  return (value) => value.replace(pattern, (prefix) => lookup.get(prefix) ?? prefix);
}
function childPath(path, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
function scrubValue(value, path, scrub) {
  if (typeof value === "string") {
    const scrubbed = scrub(value);
    const leak = leakPattern.exec(scrubbed);
    if (leak !== null) {
      throw new InputError(`absolute local path ${leak[0]} remains at ${path}`);
    }
    return scrubbed;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => scrubValue(item, `${path}[${index}]`, scrub));
  }
  if (typeof value === "object" && value !== null) {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const scrubbedKey = scrubValue(key, `${childPath(path, key)}<key>`, scrub);
      result[String(scrubbedKey)] = scrubValue(item, childPath(path, key), scrub);
    }
    return result;
  }
  return value;
}
function buildPublishPayload(input) {
  if (!slug.test(input.project))
    throw new InputError(`invalid project slug: ${input.project}`);
  const root = resolve2(input.root);
  if (!isDirectory(root))
    throw new InputError(`atlas root is not a directory: ${input.root}`);
  const layout = detectLayout(root, input.project);
  const wanted = input.artifacts;
  if (wanted !== undefined) {
    const unknown = wanted.filter((artifactId) => !layout.artifactIds.includes(artifactId));
    if (unknown.length > 0) {
      throw new InputError(`unknown artifact(s) in ${layout.name} layout: ${unknown.join(", ")}`);
    }
  }
  const selected = layout.artifactIds.filter((artifactId) => wanted === undefined || wanted.includes(artifactId));
  const figures = selected.map((artifactId) => {
    const files = layout.files(artifactId);
    return {
      spec: readSpec(root, files.spec, artifactId),
      scene: readScene2(root, files.drawing),
      verify: []
    };
  });
  const lead = figures[0]?.spec;
  if (lead === undefined)
    throw new InputError(`no artifacts selected for ${input.project}`);
  const repoName = input.repoName ?? basename3(lead.source.root);
  const replacements = new Map;
  const home = process.env["HOME"];
  if (home !== undefined)
    replacements.set(resolve2(home), "~");
  replacements.set(root, "~");
  replacements.set(realpathSync(root), "~");
  for (const figure of figures)
    replacements.set(figure.spec.source.root, repoName);
  const payload = {
    projectId: input.project,
    repoName,
    commit: lead.source.commit,
    figures
  };
  return scrubValue(payload, "$", scrubber(replacements));
}

// src/verify-record.ts
import { existsSync as existsSync10, realpathSync as realpathSync2 } from "fs";
import { dirname as dirname9, isAbsolute as isAbsolute7, relative as relative3, resolve as resolve3, sep as sep2 } from "path";
var defaultTimeoutMs = 1e4;
var defaultOutputLimitBytes = 16 * 1024;
var truncatedMarker = "\u2026[truncated]";
var shellSyntax = new Set(["|", "&", ";", "<", ">", "$", "`", "(", ")", "*"]);
var sedPrintScript = /^\d+(,\d+)?p$/u;
var searchOptions = {
  "-n": "flag",
  "-i": "flag",
  "-F": "flag",
  "-w": "flag",
  "-l": "flag",
  "-c": "flag",
  "-e": "pattern"
};
var contextOptions = {
  "-A": "number",
  "-B": "number",
  "-C": "number"
};
var commandOptions = {
  rg: {
    ...searchOptions,
    ...contextOptions,
    "-S": "flag",
    "--smart-case": "flag",
    "--count": "flag",
    "-g": "text",
    "--glob": "text",
    "-t": "text",
    "--type": "text",
    "--no-heading": "flag",
    "--hidden": "flag"
  },
  grep: { ...searchOptions, ...contextOptions, "-E": "flag", "-h": "flag", "-H": "flag" },
  cat: {},
  head: { "-n": "number" },
  tail: { "-n": "number" },
  wc: { "-l": "flag", "-w": "flag", "-c": "flag" },
  ls: { "-l": "flag", "-a": "flag", "-1": "flag" }
};
var gitOptions = {
  show: { "--stat": "flag", "--name-only": "flag", "--format": "format" },
  log: { "-n": "number", "--oneline": "flag", "--format": "format", "--stat": "flag" },
  "ls-files": {},
  "rev-parse": { "--verify": "flag", "--short": "flag" },
  blame: { "-L": "lines" },
  diff: { "--stat": "flag", "--name-only": "flag" },
  grep: searchOptions
};
function tokenize(command) {
  if (command.includes("\x00"))
    return { status: "rejected", reason: "unparseable" };
  const argv = [];
  let token = "";
  let tokenStarted = false;
  let quote = null;
  for (const character of command) {
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      tokenStarted = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (shellSyntax.has(character)) {
      return { status: "rejected", reason: "shell syntax" };
    }
    if (/\s/u.test(character)) {
      if (tokenStarted) {
        argv.push(token);
        token = "";
        tokenStarted = false;
      }
      continue;
    }
    token += character;
    tokenStarted = true;
  }
  if (quote !== null)
    return { status: "rejected", reason: "unparseable" };
  if (tokenStarted)
    argv.push(token);
  return { status: "ok", argv };
}
function validOptionValue(kind, value) {
  if (kind === "number")
    return /^\d+$/u.test(value);
  if (kind === "lines")
    return /^\d+,\d+$/u.test(value);
  if (kind === "format")
    return !/%[G(]/u.test(value);
  return true;
}
function parseOptions2(args, allowlist) {
  const operands = [];
  let afterSeparator = false;
  let hasPattern = false;
  for (let index = 0;index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined)
      return null;
    if (!afterSeparator && argument === "--") {
      afterSeparator = true;
      continue;
    }
    if (afterSeparator || !argument.startsWith("-") || argument === "-") {
      operands.push({ value: argument, afterSeparator });
      continue;
    }
    const long = argument.startsWith("--");
    const equals = argument.indexOf("=");
    const names = long ? [equals === -1 ? argument : argument.slice(0, equals)] : [...argument.slice(1)].map((character) => `-${character}`);
    for (const [offset, name] of names.entries()) {
      const kind = Object.hasOwn(allowlist, name) ? allowlist[name] : undefined;
      if (kind === undefined)
        return null;
      if (kind === "flag") {
        if (long && equals !== -1)
          return null;
        continue;
      }
      const attached = long ? equals === -1 ? undefined : argument.slice(equals + 1) : offset + 2 < argument.length ? argument.slice(offset + 2) : undefined;
      if (kind === "format" && attached === undefined)
        return null;
      const value = attached ?? args[++index];
      if (value === undefined || !validOptionValue(kind, value))
        return null;
      if (kind === "pattern")
        hasPattern = true;
      break;
    }
  }
  return { operands, hasPattern };
}
function isRevision(value) {
  return /^[A-Za-z0-9_][A-Za-z0-9_./-]*(?:[~^]\d*)*$/u.test(value) && !value.includes("..");
}
function commandPaths(argv) {
  const executable = argv[0] ?? "";
  if (executable === "sed") {
    if (argv[1] !== "-n" || !sedPrintScript.test(argv[2] ?? "") || argv.slice(3).some((argument) => argument.startsWith("-"))) {
      return { reason: "option not allowlisted" };
    }
    return { paths: argv.slice(3) };
  }
  const subcommand = argv[1] ?? "";
  const table = executable === "git" ? gitOptions : commandOptions;
  const key = executable === "git" ? subcommand : executable;
  if (!Object.hasOwn(table, key)) {
    return {
      reason: executable === "git" && subcommand.startsWith("-") ? "option not allowlisted" : "not allowlisted"
    };
  }
  const parsed = parseOptions2(argv.slice(executable === "git" ? 2 : 1), table[key] ?? {});
  if (parsed === null)
    return { reason: "option not allowlisted" };
  if (executable === "rg" || executable === "grep" || executable === "git" && subcommand === "grep") {
    return { paths: parsed.operands.slice(parsed.hasPattern ? 0 : 1).map(({ value }) => value) };
  }
  if (executable !== "git")
    return { paths: parsed.operands.map(({ value }) => value) };
  const paths = [];
  for (const { value, afterSeparator } of parsed.operands) {
    if (afterSeparator || subcommand === "ls-files") {
      paths.push(value);
    } else if (subcommand === "show") {
      const colon = value.indexOf(":");
      if (!isRevision(colon === -1 ? value : value.slice(0, colon))) {
        return { reason: "not allowlisted" };
      }
      if (colon !== -1)
        paths.push(value.slice(colon + 1));
    } else if (subcommand === "rev-parse") {
      if (!isRevision(value))
        return { reason: "not allowlisted" };
    } else if (subcommand === "diff") {
      const revisions = value.split("..");
      if (revisions.length !== 2 || !revisions.every(isRevision)) {
        return { reason: "not allowlisted" };
      }
    } else {
      return { reason: "not allowlisted" };
    }
  }
  return { paths };
}
function realpathOrNearestExistingParent(path) {
  let current = path;
  while (!existsSync10(current)) {
    const parent = dirname9(current);
    if (parent === current)
      return null;
    current = parent;
  }
  try {
    return realpathSync2(current);
  } catch {
    return null;
  }
}
function isWithinRoot(path, realRoot) {
  const fromRoot = relative3(realRoot, path);
  return fromRoot === "" || fromRoot !== ".." && !fromRoot.startsWith(`..${sep2}`) && !isAbsolute7(fromRoot);
}
function isConfinedPath(argument, realRoot) {
  if (argument.startsWith("/") || argument.startsWith("~") || argument.startsWith("$") || argument.split("/").includes("..")) {
    return false;
  }
  const canonical = realpathOrNearestExistingParent(resolve3(realRoot, argument));
  return canonical !== null && isWithinRoot(canonical, realRoot);
}
async function capture(stream, outputLimitBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let retainedBytes = 0;
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done)
      break;
    totalBytes += result.value.byteLength;
    if (retainedBytes >= outputLimitBytes)
      continue;
    const remaining = outputLimitBytes - retainedBytes;
    const retained = result.value.subarray(0, remaining);
    chunks.push(retained);
    retainedBytes += retained.byteLength;
  }
  const bytes = new Uint8Array(retainedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const output = new TextDecoder().decode(bytes);
  return totalBytes > outputLimitBytes ? `${output}${truncatedMarker}` : output;
}
async function run2(argv, repoRoot, timeoutMs, outputLimitBytes, gitOverrides = []) {
  const git = argv[0] === "git";
  const subcommand = argv[1] ?? "";
  const child = Bun.spawn(git ? [
    "git",
    "--no-pager",
    "--no-optional-locks",
    "--no-lazy-fetch",
    "--literal-pathspecs",
    `--work-tree=${repoRoot}`,
    "-c",
    "core.pager=cat",
    "-c",
    "core.fsmonitor=",
    "-c",
    "diff.external=",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "log.showSignature=false",
    "-c",
    "format.pretty=medium",
    "-c",
    "diff.orderFile=/dev/null",
    "-c",
    "diff.submodule=short",
    "-c",
    "diff.autoRefreshIndex=false",
    "-c",
    "core.attributesFile=/dev/null",
    "-c",
    "core.excludesFile=/dev/null",
    "-c",
    "mailmap.file=/dev/null",
    "-c",
    "blame.ignoreRevsFile=",
    ...gitOverrides,
    subcommand,
    ...["show", "log", "diff"].includes(subcommand) ? ["--no-ext-diff", "--no-textconv"] : [],
    ...["blame", "grep"].includes(subcommand) ? ["--no-textconv"] : [],
    ...argv.slice(2).map((argument, index) => {
      const separator = argv.indexOf("--", 2);
      if (!["show", "log"].includes(subcommand) || separator !== -1 && index + 2 > separator || !argument.startsWith("--format="))
        return argument;
      const format = argument.slice("--format=".length);
      return /^(?:tformat|format):/u.test(format) ? argument : `--format=tformat:${format}`;
    })
  ] : [...argv], {
    cwd: repoRoot,
    env: {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      ...git ? {
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
        GIT_PAGER: "cat",
        PAGER: "cat"
      } : {}
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill(9);
  }, timeoutMs);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      capture(child.stdout, outputLimitBytes),
      capture(child.stderr, outputLimitBytes)
    ]);
    return {
      exitCode: timedOut ? null : exitCode,
      stdout,
      stderr,
      reason: timedOut ? "timeout" : null
    };
  } finally {
    clearTimeout(timer);
  }
}
async function recordVerify(spec, repoRoot, options = {}) {
  const checkedRoot = ensureRealDirectory(repoRoot, "repo root");
  const realRoot = realpathSync2(checkedRoot);
  const filters = await run2([
    "git",
    "config",
    "--null",
    "--name-only",
    "--get-regexp",
    "^filter\\..*\\.(clean|smudge|process|required)$"
  ], realRoot, defaultTimeoutMs, defaultOutputLimitBytes);
  const filterKeys = filters.stdout.split("\x00").filter(Boolean);
  const gitOverrides = filterKeys.flatMap((key) => [
    "-c",
    `${key}=${key.endsWith(".required") ? "false" : ""}`
  ]);
  const filtersChecked = (filters.exitCode === 0 || filters.exitCode === 1) && !filters.stdout.endsWith(truncatedMarker) && filterKeys.every((key) => /^filter\.[^=\n]+\.(clean|smudge|process|required)$/u.test(key));
  const revision = await run2(["git", "rev-parse", "--verify", "HEAD"], realRoot, defaultTimeoutMs, 128);
  const commit = revision.exitCode === 0 && /^[0-9a-f]{40,64}\n?$/u.test(revision.stdout) ? revision.stdout.trim() : null;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const outputLimitBytes = options.outputLimitBytes ?? defaultOutputLimitBytes;
  const steps = spec.learning?.verify ?? [];
  const records = [];
  for (const [index, step] of steps.entries()) {
    const common = {
      index,
      semanticId: String(step.semanticId),
      how: step.how,
      commit,
      ranAt: new Date().toISOString()
    };
    if (step.command === undefined) {
      records.push({
        ...common,
        command: null,
        status: "not-run",
        reason: "no command",
        exitCode: null,
        stdout: "",
        stderr: ""
      });
      continue;
    }
    const tokenized = tokenize(step.command);
    if (tokenized.status === "rejected") {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: tokenized.reason,
        exitCode: null,
        stdout: "",
        stderr: ""
      });
      continue;
    }
    const checked = commandPaths(tokenized.argv);
    if ("reason" in checked) {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: checked.reason,
        exitCode: null,
        stdout: "",
        stderr: ""
      });
      continue;
    }
    if (tokenized.argv[0] === "git" && !filtersChecked) {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: "not allowlisted",
        exitCode: null,
        stdout: "",
        stderr: ""
      });
      continue;
    }
    if (!checked.paths.every((path) => isConfinedPath(path, realRoot))) {
      records.push({
        ...common,
        command: step.command,
        status: "not-run",
        reason: "path outside repo",
        exitCode: null,
        stdout: "",
        stderr: ""
      });
      continue;
    }
    records.push({
      ...common,
      command: step.command,
      status: "ran",
      ...await run2(tokenized.argv, realRoot, timeoutMs, outputLimitBytes, gitOverrides)
    });
  }
  return records;
}

// src/remote-client.ts
var defaultRemote = "https://atlas.iyendev.com";
var slug2 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var elementId = /^[A-Za-z0-9_-]{1,128}$/;
var leakPattern2 = /\/Users\/|\/home\/|\/private\/var\//;
var localHosts = new Set(["127.0.0.1", "localhost"]);
var requestTimeoutMs = 60000;
var invalidPublishResponse = "remote returned an invalid publish response";
var invalidExportResponse = "remote returned an invalid export response";
var credentialsSchema = object({
  clientId: string2().min(1),
  clientSecret: string2().min(1)
});
var publishResultSchema = object({
  artifactId: string2().regex(slug2),
  outcome: _enum(["created", "refreshed", "conflict"]),
  token: string2().regex(/^cas-\d+$/),
  deprecatedAnchors: array(string2().regex(elementId)),
  orphanedNotes: array(string2().regex(elementId))
});
var exportResponseSchema = object({
  figures: array(object({
    artifactId: string2().regex(slug2),
    spec: record(string2(), unknown()),
    scene: looseObject({ elements: array(unknown()) }),
    notes: array(unknown()),
    verify: array(unknown())
  }))
}).refine(({ figures }) => new Set(figures.map((figure) => figure.artifactId)).size === figures.length);
function publishResponseSchema(sent) {
  return object({ results: array(publishResultSchema) }).refine(({ results }) => {
    const answered = new Set(results.map((result) => result.artifactId));
    return results.length === sent.length && answered.size === results.length && sent.every((artifactId) => answered.has(artifactId));
  });
}
function credentialRedactor(credentials) {
  const idPart = /^(.+)\.access$/.exec(credentials.clientId)?.[1];
  const secrets = [credentials.clientSecret, ...idPart === undefined ? [] : [idPart]].sort((left, right) => right.length - left.length);
  return (text) => secrets.reduce((current, secret) => current.split(secret).join("***"), text);
}
function parseRemote(remote) {
  let url;
  try {
    url = new URL(remote);
  } catch {
    throw new InputError(`invalid --remote URL: ${remote}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new InputError("--remote must not embed credentials");
  }
  const local = localHosts.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new InputError("--remote must use https unless the host is 127.0.0.1 or localhost");
  }
  return url;
}
function loadCredentials(env) {
  const clientId = env["VISUAL_ATLAS_CLIENT_ID"];
  const clientSecret = env["VISUAL_ATLAS_CLIENT_SECRET"];
  if (clientId && clientSecret)
    return { clientId, clientSecret };
  if (clientId || clientSecret) {
    throw new InputError("set both VISUAL_ATLAS_CLIENT_ID and VISUAL_ATLAS_CLIENT_SECRET, or neither");
  }
  const home = env["HOME"];
  if (!home)
    throw new InputError("HOME is not set; cannot locate the credentials file");
  const path = join13(home, ".config", "visual-atlas", "credentials.json");
  let status;
  try {
    status = lstatSync7(path);
  } catch {
    throw new InputError(`no publish credentials: set VISUAL_ATLAS_CLIENT_ID and VISUAL_ATLAS_CLIENT_SECRET or create ${path} (mode 0600)`);
  }
  if (!status.isFile())
    throw new InputError(`credentials file must be a regular file: ${path}`);
  const mode = status.mode & 511;
  if (mode !== 384) {
    throw new InputError(`credentials file must have mode 0600, found 0${mode.toString(8)}: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync13(path, "utf8"));
  } catch {
    throw new InputError(`malformed credentials JSON: ${path}`);
  }
  const credentials = credentialsSchema.safeParse(parsed);
  if (!credentials.success) {
    throw new InputError(`credentials file needs string clientId and clientSecret: ${path}`);
  }
  return credentials.data;
}
function accessHeaders(remote, credentials, env) {
  const headers = {
    "CF-Access-Client-Id": credentials.clientId,
    "CF-Access-Client-Secret": credentials.clientSecret
  };
  const devJwt = env["VISUAL_ATLAS_DEV_JWT"];
  if (localHosts.has(remote.hostname) && devJwt)
    headers["Cf-Access-Jwt-Assertion"] = devJwt;
  return headers;
}
function remoteErrorDetail(text) {
  try {
    const body = JSON.parse(text);
    const error = object({ error: object({ code: string2(), message: string2() }) }).safeParse(body);
    if (error.success)
      return `${error.data.error.code}: ${error.data.error.message}`;
  } catch {}
  return "unexpected response";
}
async function request(remote, path, credentials, env, body) {
  const url = new URL(path, remote);
  const method = body === undefined ? "GET" : "POST";
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...accessHeaders(remote, credentials, env),
        ...body === undefined ? {} : { "Content-Type": "application/json" }
      },
      ...body === undefined ? {} : { body },
      redirect: "manual",
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new RuntimeError(timedOut ? `remote ${remote.origin} did not answer within ${requestTimeoutMs / 1000}s` : `cannot reach remote ${remote.origin}`);
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    let host = "";
    try {
      host = new URL(response.headers.get("location") ?? "", url).hostname;
    } catch {}
    if (host === "cloudflareaccess.com" || host.endsWith(".cloudflareaccess.com")) {
      throw new RuntimeError("remote requires Access authentication; check service token");
    }
    throw new RuntimeError(`remote answered ${method} ${path} with redirect ${response.status}; not following`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new RuntimeError(credentialRedactor(credentials)(`remote ${method} ${path} failed with ${response.status}: ${remoteErrorDetail(text)}`).slice(0, 500));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RuntimeError(`remote ${method} ${path} returned invalid JSON`);
  }
}
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scrubVerify(value, path, replacements) {
  const rules = [...replacements.keys()].filter((prefix) => prefix.length > 1).sort((left, right) => right.length - left.length);
  const pattern = rules.length === 0 ? null : new RegExp(`(?:${rules.map(escapeRegExp2).join("|")})(?![A-Za-z0-9._-])`, "g");
  const scrub = (text, at) => {
    const scrubbed = pattern === null ? text : text.replace(pattern, (prefix) => replacements.get(prefix) ?? prefix);
    const leak = leakPattern2.exec(scrubbed);
    if (leak !== null)
      throw new InputError(`absolute local path ${leak[0]} remains at ${at}`);
    return scrubbed;
  };
  const walk = (item, at) => {
    if (typeof item === "string")
      return scrub(item, at);
    if (Array.isArray(item))
      return item.map((entry, index) => walk(entry, `${at}[${index}]`));
    if (typeof item === "object" && item !== null) {
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [
        scrub(key, `${at}.${key}<key>`),
        walk(entry, `${at}.${key}`)
      ]));
    }
    return item;
  };
  return walk(value, path);
}
function notRunVerify(spec) {
  const ranAt = new Date().toISOString();
  return (spec.learning?.verify ?? []).map((step, index) => ({
    index,
    semanticId: String(step.semanticId),
    how: step.how,
    command: step.command ?? null,
    status: "not-run",
    reason: "repo not provided",
    exitCode: null,
    stdout: "",
    stderr: "",
    commit: null,
    ranAt
  }));
}
function realpathOrSelf(path) {
  try {
    return realpathSync3(path);
  } catch {
    return path;
  }
}
async function attachVerify(payload, input) {
  const replacements = new Map;
  for (const home of [process.env["HOME"], input.env["HOME"]]) {
    if (home)
      replacements.set(resolve4(home), "~");
  }
  const root = resolve4(input.root);
  replacements.set(root, "~");
  replacements.set(realpathOrSelf(root), "~");
  if (input.repoRoot !== undefined) {
    replacements.set(input.repoRoot, payload.repoName);
    replacements.set(realpathOrSelf(input.repoRoot), payload.repoName);
  }
  const figures = [];
  for (const [index, figure] of payload.figures.entries()) {
    const verify = input.repoRoot === undefined ? notRunVerify(figure.spec) : await recordVerify(figure.spec, input.repoRoot);
    figures.push({
      ...figure,
      verify: scrubVerify(verify, `$.figures[${index}].verify`, replacements)
    });
  }
  return { ...payload, figures };
}
async function publish(input) {
  const remote = parseRemote(input.remote);
  const credentials = input.credentials ?? loadCredentials(input.env);
  const payload = await attachVerify(buildPublishPayload({
    root: input.root,
    project: input.project,
    ...input.artifacts === undefined ? {} : { artifacts: input.artifacts }
  }), {
    root: input.root,
    env: input.env,
    ...input.repoRoot === undefined ? {} : { repoRoot: input.repoRoot }
  });
  const sent = payload.figures.map((figure) => String(figure.spec.artifactId));
  const response = publishResponseSchema(sent).safeParse(await request(remote, "/api/publish", credentials, input.env, JSON.stringify(payload)));
  if (!response.success)
    throw new RuntimeError(invalidPublishResponse);
  return { projectId: payload.projectId, results: response.data.results };
}
function existingBytes(out, relativePath) {
  const path = join13(out, relativePath);
  let status;
  try {
    status = lstatSync7(path);
  } catch {
    return null;
  }
  if (!status.isFile())
    throw new CollisionError(relativePath);
  return readFileSync13(path, "utf8");
}
async function pull(input) {
  if (!slug2.test(input.project))
    throw new InputError(`invalid project slug: ${input.project}`);
  const out = ensureRealDirectory(input.out, "--out");
  const remote = parseRemote(input.remote);
  const credentials = input.credentials ?? loadCredentials(input.env);
  const response = exportResponseSchema.safeParse(await request(remote, `/api/projects/${input.project}/export`, credentials, input.env));
  if (!response.success)
    throw new RuntimeError(invalidExportResponse);
  const project = input.project;
  const projectRoot = resolve4(out, project);
  const files = [];
  for (const figure of response.data.figures) {
    const id = figure.artifactId;
    files.push({
      path: `${project}/${id}.excalidraw.md`,
      bytes: encodeSceneToMarkdown(figure.scene)
    }, { path: `${project}/specs/${id}.json`, bytes: jsonBytes(figure.spec) }, { path: `${project}/notes/${id}.json`, bytes: jsonBytes(figure.notes) }, { path: `${project}/verify/${id}.json`, bytes: jsonBytes(figure.verify) });
  }
  if (files.some((file) => !resolve4(out, file.path).startsWith(`${projectRoot}${sep3}`))) {
    throw new RuntimeError(invalidExportResponse);
  }
  for (const folder of ["specs", "notes", "verify"])
    safeMakeDirectories(out, `${project}/${folder}`);
  const written = [];
  const unchanged = [];
  for (const file of files) {
    const current = existingBytes(out, file.path);
    if (current === null)
      written.push(file.path);
    else if (current === file.bytes)
      unchanged.push(file.path);
    else
      throw new CollisionError(file.path);
  }
  for (const file of files) {
    if (written.includes(file.path))
      safeCreateFile(out, file.path, file.bytes);
  }
  return { project, figures: response.data.figures.length, written, unchanged };
}

// src/session-export.ts
import {
  lstatSync as lstatSync8,
  mkdirSync as mkdirSync8,
  mkdtempSync as mkdtempSync2,
  readdirSync as readdirSync5,
  readFileSync as readFileSync14,
  realpathSync as realpathSync4,
  rmSync as rmSync5,
  writeFileSync as writeFileSync7
} from "fs";
import { dirname as dirname10, isAbsolute as isAbsolute8, join as join14, normalize as normalize6 } from "path";

// src/learning-note.ts
var statusText = {
  fact: "\uD655\uC778\uB41C \uC0AC\uC2E4",
  inference: "\uADFC\uAC70 \uAE30\uBC18 \uCD94\uB860",
  question: "\uBBF8\uD655\uC778 \uC9C8\uBB38"
};
var relationText = {
  "runtime-call": "\uC2E4\uD589 \uC911 \uD638\uCD9C",
  "data-movement": "\uB370\uC774\uD130 \uC774\uB3D9",
  "state-transition": "\uC0C1\uD0DC \uC804\uC774",
  "static-reference": "\uC815\uC801 \uCC38\uC870"
};
function firstLine(label) {
  return label.split(`
`)[0] ?? label;
}
function claimsById(spec) {
  return new Map([...spec.nodes, ...spec.edges].map((claim) => [claim.semanticId, claim]));
}
function routeNumbers(spec) {
  return new Map((spec.learning?.route ?? []).map((step, index) => [step.semanticId, index + 1]));
}
function callout(kind, title, body, folded = false) {
  return [
    `> [!${kind}]${folded ? "-" : ""} ${title}`,
    ...body.flatMap((line) => line.split(`
`)).map((line) => `> ${line}`)
  ].join(`
`);
}
function learningHeader(spec) {
  const learning = spec.learning;
  if (learning === undefined)
    return "";
  return `${callout("question", "\uC774 \uADF8\uB9BC\uC774 \uB2F5\uD558\uB294 \uC9C8\uBB38", [learning.question, "", `**\uB2F5:** ${learning.answer}`])}

`;
}
function textDiagram(spec) {
  const numbers = routeNumbers(spec);
  const name = (id) => {
    const node = spec.nodes.find((candidate) => candidate.semanticId === id);
    const label = node === undefined ? id : firstLine(node.label);
    const number = numbers.get(id);
    return number === undefined ? `[${label}]` : `(${number}) [${label}]`;
  };
  const orderedNodes = [
    ...spec.nodes.filter((node) => numbers.has(node.semanticId)),
    ...spec.nodes.filter((node) => !numbers.has(node.semanticId))
  ].sort((left, right) => (numbers.get(left.semanticId) ?? Number.MAX_SAFE_INTEGER) - (numbers.get(right.semanticId) ?? Number.MAX_SAFE_INTEGER));
  const nodeLines = orderedNodes.map((node) => `${name(node.semanticId)}${node.status === "fact" ? "" : ` ?${node.status}`}`);
  const edgeLines = spec.edges.map((edge) => {
    const verb = firstLine(edge.label);
    const relation = edge.relation === undefined ? "" : ` <${edge.relation}>`;
    const marker = edge.status === "fact" ? "--" : "..";
    return `${name(edge.from)} ${marker}${verb}${relation}${marker}> ${name(edge.to)}`;
  });
  return [...nodeLines, "", ...edgeLines].join(`
`).trimEnd();
}
function routeSection(spec) {
  const learning = spec.learning;
  if (learning === undefined || learning.route.length === 0)
    return null;
  const claims = claimsById(spec);
  const steps = learning.route.map((step, index) => {
    const claim = claims.get(step.semanticId);
    const label = claim === undefined ? step.semanticId : firstLine(claim.label);
    const status = claim === undefined ? "" : ` \xB7 ${statusText[claim.status]}`;
    return `${index + 1}. **${label}**${status} \u2014 ${step.explanation}`;
  });
  return `## \uC77D\uB294 \uC21C\uC11C

\uADF8\uB9BC\uC758 \uBC88\uD638\uB97C \uB530\uB77C\uAC00\uBA74 \uB418\uB294 \uAD8C\uC7A5 \uACBD\uB85C\uB2E4. \uD544\uC694\uD55C \uBC88\uD638\uBD80\uD130 \uBC14\uB85C \uC77D\uC5B4\uB3C4 \uB41C\uB2E4.

${steps.join(`
`)}`;
}
function relationLegend(spec) {
  const used = [...new Set(spec.edges.map((edge) => edge.relation))].filter((relation) => relation !== undefined);
  if (used.length === 0)
    return null;
  const rows = used.map((relation) => {
    const edges = spec.edges.filter((edge) => edge.relation === relation).map((edge) => `\`${firstLine(edge.label)}\``).join(", ");
    return `- **${relationText[relation]}** (\`${relation}\`): ${edges}`;
  });
  return `## \uD654\uC0B4\uD45C\uAC00 \uB73B\uD558\uB294 \uAC83

${rows.join(`
`)}
- \uC2E4\uC120\uC740 \uD655\uC778\uB41C \uAD00\uACC4, \uC810\uC120\uC740 \uCD94\uB860\uC774\uB2E4. \uC0C9\uC740 \uC18C\uC18D(category)\uB9CC \uB098\uD0C0\uB0B4\uACE0 \uD655\uC2E4\uC131\uC744 \uB098\uD0C0\uB0B4\uC9C0 \uC54A\uB294\uB2E4.`;
}
function glossarySection(spec) {
  const glossary = spec.learning?.glossary ?? [];
  if (glossary.length === 0)
    return null;
  return `## \uC6A9\uC5B4

${glossary.map((entry) => `- \`${entry.term}\` \u2014 ${entry.meaning}`).join(`
`)}`;
}
function scopeSection(spec) {
  const scope = spec.learning?.scope;
  if (scope === undefined || scope.covers.length === 0 && scope.omits.length === 0)
    return null;
  const covers = scope.covers.map((item) => `- ${item}`).join(`
`);
  const omits = scope.omits.map((item) => `- ${item}`).join(`
`);
  return `## \uC774 \uADF8\uB9BC\uC758 \uBC94\uC704

${covers.length === 0 ? "" : `**\uB2E4\uB8E8\uB294 \uAC83**

${covers}

`}${omits.length === 0 ? "" : `**\uB2E4\uB8E8\uC9C0 \uC54A\uB294 \uAC83** \u2014 \uC5EC\uAE30\uC5D0 \uC5C6\uB2E4\uACE0 \uD574\uC11C \uC874\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4\uB294 \uB73B\uC740 \uC544\uB2C8\uB2E4.

${omits}`}`.trimEnd();
}
function verifySection(spec) {
  const verify = spec.learning?.verify ?? [];
  if (verify.length === 0)
    return null;
  const claims = claimsById(spec);
  const numbers = routeNumbers(spec);
  const rows = verify.map((step) => {
    const claim = claims.get(step.semanticId);
    const label = claim === undefined ? step.semanticId : firstLine(claim.label);
    const number = numbers.get(step.semanticId);
    const command = step.command === undefined ? "" : `
  \`\`\`sh
  ${step.command}
  \`\`\``;
    return `- [ ] ${number === undefined ? "" : `(${number}) `}**${label}** \u2014 ${step.how}${command}`;
  });
  return `## \uC9C1\uC811 \uD655\uC778\uD558\uB294 \uBC95

\uADF8\uB9BC\uC744 \uBBFF\uAE30 \uC804\uC5D0 \uD655\uC778\uD560 \uC218 \uC788\uB294 \uC9C0\uC810\uC774\uB2E4.

${rows.join(`
`)}`;
}
function checksSection(spec) {
  const checks = spec.learning?.checks ?? [];
  if (checks.length === 0)
    return null;
  return `## \uC2A4\uC2A4\uB85C \uC810\uAC80

\uBA3C\uC800 \uB2F5\uC744 \uB5A0\uC62C\uB9B0 \uB4A4 \uD3BC\uCCD0\uC11C \uB9DE\uCDB0 \uBCF8\uB2E4.

${checks.map((check, index) => callout("example", `Q${index + 1}. ${check.prompt}`, [check.answer], true)).join(`

`)}`;
}
function analogySection(spec) {
  const analogies = spec.learning?.analogies ?? [];
  if (analogies.length === 0)
    return null;
  return `## \uBE44\uC720\uC640 \uADF8 \uD55C\uACC4

${analogies.map((entry) => `**${entry.analogy}**

- \uB9DE\uB294 \uBD80\uBD84:
${entry.holds.map((item) => `  - ${item}`).join(`
`)}
- \uB9DE\uC9C0 \uC54A\uB294 \uBD80\uBD84:
${entry.breaks.map((item) => `  - ${item}`).join(`
`)}`).join(`

`)}`;
}
function learningSections(spec) {
  if (spec.learning === undefined)
    return "";
  const sections = [
    routeSection(spec),
    `## \uD14D\uC2A4\uD2B8 \uB3C4\uC2DD

\`\`\`text
${textDiagram(spec)}
\`\`\``,
    relationLegend(spec),
    glossarySection(spec),
    scopeSection(spec),
    verifySection(spec),
    checksSection(spec),
    analogySection(spec)
  ].filter((section) => section !== null);
  return `${sections.join(`

`)}

`;
}
function learningIndexLines(spec) {
  const learning = spec.learning;
  if (learning === undefined)
    return "";
  return `**\uC9C8\uBB38:** ${learning.question}

**\uB2F5:** ${learning.answer}

`;
}

// src/svg-gallery.ts
var CARD_PADDING = 32;
var CAPTION_HEIGHT = 48;
var CATEGORY_PALETTE2 = {
  cloudflare: { fill: "#fff4e6", stroke: "#e8590c", text: "#7c2d12" },
  aws: { fill: "#fff9db", stroke: "#f08c00", text: "#78350f" },
  external: { fill: "#f8fafc", stroke: "#64748b", text: "#334155" },
  data: { fill: "#e7f5ff", stroke: "#1971c2", text: "#0c4a6e" },
  runtime: { fill: "#f3f0ff", stroke: "#7950f2", text: "#4c1d95" },
  security: { fill: "#ebfbee", stroke: "#2f9e44", text: "#14532d" },
  risk: { fill: "#fff5f5", stroke: "#e03131", text: "#7f1d1d" },
  neutral: { fill: "#f8fafc", stroke: "#475569", text: "#0f172a" }
};
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function textLines(text, x, fontSize, fill) {
  return text.split(`
`).map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize + 4}" fill="${fill}">${escapeXml(line)}</tspan>`).join("");
}
function paletteFor(category) {
  return CATEGORY_PALETTE2[category];
}
function shapeMarkup(type, x, y, width, height, palette, dashArray, isFrame) {
  const shared = `fill="${palette.fill}" fill-opacity="${isFrame ? "0.55" : "1"}" stroke="${palette.stroke}" stroke-width="${isFrame ? "2" : "3"}"${dashArray === null ? "" : ` stroke-dasharray="${dashArray}"`} vector-effect="non-scaling-stroke"`;
  if (type === "ellipse")
    return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" ${shared} filter="url(#soft-shadow)"/>`;
  if (type === "diamond") {
    const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
    return `<polygon points="${points}" ${shared} stroke-linejoin="round" filter="url(#soft-shadow)"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${isFrame ? "28" : "18"}" ${shared}${isFrame ? "" : ' filter="url(#soft-shadow)"'}/>`;
}
function styleMap(styles) {
  return new Map(styles.map((style) => [style.semanticId, style]));
}
function sceneSize(plan) {
  return {
    width: Math.max(...plan.elements.map((element) => element.x + element.width), 0) + CARD_PADDING,
    height: Math.max(...plan.elements.map((element) => element.y + element.height), 0) + CARD_PADDING
  };
}
function plannedView(view) {
  const plan = planScene(view.spec);
  return { view, plan, size: sceneSize(plan) };
}
function routeBadges(view, plan, originX, originY) {
  const route = view.spec.learning?.route ?? [];
  const shapes = new Map(plan.elements.filter((element) => element.role === "node-shape").map((element) => [element.semanticId, element]));
  return route.map((step, index) => {
    const shape = shapes.get(step.semanticId);
    if (shape === undefined)
      return "";
    const cx = originX + shape.x + 4;
    const cy = originY + CAPTION_HEIGHT + shape.y + 4;
    return `<g data-route-step="${index + 1}"><circle cx="${cx}" cy="${cy}" r="15" fill="#0f172a" stroke="#ffffff" stroke-width="3"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="ui-sans-serif, sans-serif" font-size="14" font-weight="700" fill="#ffffff">${index + 1}</text></g>`;
  }).join("");
}
function renderCard(planned, originX, originY) {
  const { view, plan, size } = planned;
  const styles = styleMap(view.styles);
  const pieces = [
    `<rect x="${originX}" y="${originY}" width="${size.width + CARD_PADDING}" height="${size.height + CAPTION_HEIGHT}" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>`,
    `<text x="${originX + 24}" y="${originY + 29}" font-family="ui-sans-serif, sans-serif" font-size="12" font-weight="700" fill="#64748b">${escapeXml(`${view.kind} \xB7 ${view.viewId}`)}</text>`
  ];
  for (const element of plan.elements) {
    const style = styles.get(element.semanticId) ?? {
      fill: "#ffffff",
      stroke: "#334155",
      text: "#0f172a",
      dashArray: null,
      badge: "TITLE"
    };
    const palette = paletteFor(element.customData.category);
    const x = originX + element.x;
    const y = originY + CAPTION_HEIGHT + element.y;
    if (["rectangle", "ellipse", "diamond"].includes(element.type)) {
      pieces.push(shapeMarkup(element.type, x, y, element.width, element.height, palette, element.customData.status === "inference" ? "10 7" : style.dashArray, element.role === "frame-shape"));
      continue;
    }
    if (element.type === "arrow") {
      const end = element.points[1];
      if (end === undefined)
        throw new TypeError(`missing arrow endpoint for ${element.id}`);
      pieces.push(`<line x1="${x}" y1="${y}" x2="${x + end[0]}" y2="${y + end[1]}" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arrow)"${element.customData.status === "inference" ? ' stroke-dasharray="10 7"' : ""}/>`);
      continue;
    }
    if (element.text === null)
      continue;
    const fontSize = element.role === "title" ? 30 : element.role === "frame-label" ? 20 : element.role === "edge-label" ? 12 : 16;
    const fontWeight = ["title", "frame-label", "node-label"].includes(element.role) ? "700" : "500";
    if (element.role === "edge-label")
      pieces.push(`<rect x="${x - 6}" y="${y}" width="${element.width + 12}" height="${element.height}" rx="10" fill="#ffffff" fill-opacity="0.92"/>`);
    const lines = element.text.split(`
`).length;
    const lineHeight = fontSize + 4;
    const centered = ["node-label", "edge-label"].includes(element.role);
    const textX = centered ? x + element.width / 2 : x;
    const textY = centered ? y + (element.height - lines * lineHeight) / 2 + fontSize : y + fontSize;
    pieces.push(`<text x="${textX}" y="${textY}" text-anchor="${centered ? "middle" : "start"}" font-family="Virgil, 'Comic Sans MS', ui-rounded, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${palette.text}">${textLines(element.text, textX, fontSize, palette.text)}</text>`);
  }
  pieces.push(routeBadges(view, plan, originX, originY));
  return pieces.join("");
}
function svgDocument(width, height, content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto-start-reverse">
      <path d="M 0 0 L 12 6 L 0 12 z" fill="#334155" />
    </marker>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10" />
    </filter>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" />
  ${content}
</svg>`;
}
function renderViewSvg(view) {
  const planned = plannedView(view);
  const { size } = planned;
  const width = size.width + CARD_PADDING * 3;
  const height = size.height + CAPTION_HEIGHT + CARD_PADDING * 3;
  return {
    width,
    height,
    svg: svgDocument(width, height, renderCard(planned, CARD_PADDING, CARD_PADDING))
  };
}

// src/session-export.ts
var projectSlug = string2().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
var kindOrder = new Map([
  ["project-map", 0],
  ["system-architecture", 1],
  ["container-architecture", 2],
  ["workflow", 3],
  ["data-flow", 4],
  ["trust-boundary", 5],
  ["component-architecture", 6],
  ["api-contract", 7],
  ["adr", 8],
  ["code-exploration", 9]
]);
function realDirectory(path, label) {
  if (!isAbsolute8(path) || normalize6(path) !== path || path === "/") {
    throw new InputError(`${label} must be a normalized absolute non-root path`);
  }
  let resolved;
  try {
    resolved = realpathSync4(path);
  } catch (error) {
    throw new InputError(`${label} does not exist: ${path}`, { cause: error });
  }
  if (!lstatSync8(resolved).isDirectory())
    throw new InputError(`${label} must be a directory`);
  return resolved;
}
function readSpecs(specDirectory) {
  const specs = readdirSync5(specDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "source.json").map((entry) => {
    const path = join14(specDirectory, entry.name);
    const spec = parseVisualNoteSpec(JSON.parse(readFileSync14(path, "utf8")));
    if (`${spec.artifactId}.json` !== entry.name) {
      throw new InputError(`spec filename must match artifactId: ${entry.name}`);
    }
    for (const claim of [...spec.nodes, ...spec.edges]) {
      if (claim.status === "fact")
        resolveEvidence(spec.source.root, claim.evidence);
    }
    return spec;
  }).sort((left, right) => (kindOrder.get(left.kind) ?? 99) - (kindOrder.get(right.kind) ?? 99) || left.artifactId.localeCompare(right.artifactId));
  if (specs.length === 0)
    throw new InputError(`no visual-note specs found in ${specDirectory}`);
  if (new Set(specs.map((spec) => spec.artifactId)).size !== specs.length) {
    throw new InputError("artifactIds must be unique across the exported series");
  }
  return specs;
}
function confidenceFor(status) {
  if (status === "fact")
    return "high";
  if (status === "inference")
    return "medium";
  return "unknown";
}
function viewFor(spec) {
  return {
    viewId: spec.artifactId,
    artifactId: spec.artifactId,
    kind: spec.kind,
    title: spec.title,
    spec,
    relatedViewIds: [],
    styles: [...spec.nodes, ...spec.edges].map((claim) => styleForClaim(claim.semanticId, claim.status, confidenceFor(claim.status))),
    split: {
      coreNodeIds: spec.nodes.map((node) => node.semanticId),
      duplicateNodeIds: [],
      edgeIds: spec.edges.map((edge) => edge.semanticId)
    }
  };
}
function evidenceText(spec) {
  return [...spec.nodes, ...spec.edges].map((claim) => {
    const evidence = claim.evidence.map((reference) => {
      const lines = reference.lineStart === undefined ? "" : `:${reference.lineStart}${reference.lineEnd === undefined ? "" : `-${reference.lineEnd}`}`;
      const symbol = reference.symbol === undefined ? "" : `#${reference.symbol}`;
      return `\`${reference.path}${lines}${symbol}\``;
    }).join(", ");
    return `- \`${claim.semanticId}\` **${claim.status}** \u2014 ${claim.label.replaceAll(`
`, " \xB7 ")}${evidence.length === 0 ? "" : ` \u2014 ${evidence}`}`;
  }).join(`
`);
}
function noteFor(specs, index) {
  const spec = specs[index];
  if (spec === undefined)
    throw new TypeError("missing series spec");
  const previous = specs[index - 1];
  const next = specs[index + 1];
  const navigation = [
    previous === undefined ? null : `[\u2190 ${previous.title}](./${previous.artifactId}.md)`,
    "[\uC2DC\uB9AC\uC988 \uD648](./index.md)",
    next === undefined ? null : `[${next.title} \u2192](./${next.artifactId}.md)`
  ].filter((value) => value !== null).join(" \xB7 ");
  return `---
artifactId: ${spec.artifactId}
kind: ${spec.kind}
revision: ${spec.revision}
---

# ${spec.title}

${navigation}

${learningHeader(spec)}![${spec.title}](./${spec.artifactId}.svg)

[Excalidraw \uC6D0\uBCF8](./${spec.artifactId}.excalidraw.md) \xB7 [\uAC80\uC99D \uC2A4\uD399](./specs/${spec.artifactId}.json)

- Source: \`${spec.source.root}\`
- Commit: \`${spec.source.commit ?? "uncommitted"}\`
- Spec revision: ${spec.revision} \xB7 validated by \`visual-note\` schema at export

${learningSections(spec)}## Evidence status

${evidenceText(spec)}
`;
}
function indexFor(project, specs) {
  const sections = specs.map((spec, index) => `## ${index + 1}. ${spec.title}

${learningIndexLines(spec)}[\uC0C1\uC138 \uB178\uD2B8 \uC5F4\uAE30](./${spec.artifactId}.md)

![${spec.title}](./${spec.artifactId}.svg)`).join(`

`);
  return `# ${project} visual architecture series

\uD55C \uC7A5\uC5D0 \uBAA8\uB4E0 \uB0B4\uC6A9\uC744 \uC555\uCD95\uD558\uC9C0 \uC54A\uACE0, \uC11C\uB85C \uB2E4\uB978 \uC9C8\uBB38\uC5D0 \uB2F5\uD558\uB294 \uC5F0\uACB0\uB41C \uC2DC\uB9AC\uC988\uB85C \uAD6C\uC131\uD588\uB2E4.

${sections}

SVG\uB294 \uC77D\uAE30 \uC804\uC6A9 \uBBF8\uB9AC\uBCF4\uAE30\uC774\uBA70, \uAC19\uC740 \uC774\uB984\uC758 \`.excalidraw.md\` \uD30C\uC77C\uC774 \uD3B8\uC9D1 \uAC00\uB2A5\uD55C \uC6D0\uBCF8\uC774\uB2E4.
`;
}
function exportSeries(input) {
  const sessionRoot = realDirectory(input.sessionRoot, "session root");
  const specDirectory = realDirectory(input.specDirectory, "spec directory");
  const project = projectSlug.parse(input.project);
  const specs = readSpecs(specDirectory);
  const tempRoot = mkdtempSync2(join14(sessionRoot, ".visual-learning-export-"));
  const stageProject = join14(tempRoot, project);
  const files = [];
  const write = (relativePath, bytes) => {
    const path = join14(stageProject, relativePath);
    mkdirSync8(dirname10(path), { recursive: true });
    writeFileSync7(path, bytes);
    files.push(relativePath);
  };
  try {
    write("index.md", indexFor(project, specs));
    for (const [index, spec] of specs.entries()) {
      const view = viewFor(spec);
      write(`${spec.artifactId}.md`, noteFor(specs, index));
      write(`${spec.artifactId}.svg`, `${renderViewSvg(view).svg}
`);
      write(`${spec.artifactId}.excalidraw.md`, encodeSceneToMarkdown(sceneFromSpec(spec, "visual-learning/session-export")));
      write(`specs/${spec.artifactId}.json`, jsonBytes(spec));
    }
    const manifest = {
      schemaVersion: 1,
      project,
      artifacts: specs.map((spec) => ({
        artifactId: spec.artifactId,
        kind: spec.kind,
        revision: spec.revision
      })),
      files: [...files].sort().map((relativePath) => ({
        relativePath,
        sha256: sha256(readFileSync14(join14(stageProject, relativePath)))
      }))
    };
    write("manifest.json", jsonBytes(manifest));
    const targetProject = join14(sessionRoot, "docs", "vl", "projects", project);
    const published = publishProjectDirectory(stageProject, targetProject);
    return {
      operation: "export-series",
      status: published.status,
      outputRoot: targetProject,
      artifacts: specs.map((spec) => spec.artifactId),
      files: [...files].sort()
    };
  } finally {
    rmSync5(tempRoot, { recursive: true, force: true });
  }
}

// src/cli.ts
var help = `visual-note 0.1.0
Usage: visual-note <command> [options]

Commands:
  init       initialize project metadata from a read-only local source
  bootstrap  stage a repeatable study-workflow sample bundle for a source
  create     validate and publish a new normalized visual-note spec
  export-series  publish a linked series under <session-root>/docs/vl/projects
  extend     validate an extension spec contract without rendering
  refresh    validate a refresh spec contract without rendering
  validate   validate a strict visual-note specification
  authoring-schema  emit the renderer-independent interactive authoring JSON Schema
  compile-authoring validate and compile before/after authoring JSON for a web renderer
  review-learning check a spec's learning layer against research-backed figure rules
  restore    validate a restore spec contract without mutation
  contract   emit the deterministic cross-agent contract sentinel
  publish    upload a project to the private hosted atlas
             --root <abs> --project <slug> [--artifact <id>]... [--repo-root <abs>] [--remote <url>]
  pull       download a project from the hosted atlas without overwriting local changes
             --project <slug> --out <abs-dir> [--remote <url>]

publish/pull read CF-Access-Client-Id/Secret from VISUAL_ATLAS_CLIENT_ID and
VISUAL_ATLAS_CLIENT_SECRET or ~/.config/visual-atlas/credentials.json (mode 0600).
The default remote is ${defaultRemote}.
`;
function takeRepeated(argv, flag) {
  const values = [];
  const rest = [];
  for (let index = 0;index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined)
      continue;
    if (argument !== flag) {
      rest.push(argument);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new InputError(`${flag} requires a value`);
    values.push(value);
    index += 1;
  }
  return [values, rest];
}
var redact = null;
function scrub(text) {
  return redact === null ? text : redact(text);
}
function remoteCredentials() {
  const credentials = loadCredentials(process.env);
  redact = credentialRedactor(credentials);
  return credentials;
}
async function runPublish(argv) {
  const [artifacts, rest] = takeRepeated(argv, "--artifact");
  const options = parseOptions(rest, new Set(["--root", "--project", "--repo-root", "--remote"]));
  const repoRoot = optional2(options, "--repo-root");
  const credentials = remoteCredentials();
  const result = await publish({
    root: required2(options, "--root"),
    project: required2(options, "--project"),
    remote: optional2(options, "--remote") ?? defaultRemote,
    env: process.env,
    credentials,
    ...artifacts.length === 0 ? {} : { artifacts },
    ...repoRoot === undefined ? {} : { repoRoot }
  });
  if (options.json) {
    process.stdout.write(scrub(formatResult(result, true)));
  } else {
    for (const figure of result.results) {
      const extras = [
        ...figure.deprecatedAnchors.length === 0 ? [] : [`deprecatedAnchors=${figure.deprecatedAnchors.join(",")}`],
        ...figure.orphanedNotes.length === 0 ? [] : [`orphanedNotes=${figure.orphanedNotes.join(",")}`]
      ];
      process.stdout.write(scrub(`${[figure.outcome, figure.artifactId, figure.token, ...extras].join(" ")}
`));
    }
  }
  const conflicts = result.results.filter((figure) => figure.outcome === "conflict");
  if (conflicts.length > 0) {
    throw new ConflictError(`publish conflict for ${conflicts.map((figure) => figure.artifactId).join(", ")}`);
  }
}
async function run3(command, argv) {
  switch (command) {
    case "publish":
      await runPublish(argv);
      return;
    case "pull": {
      const options = parseOptions(argv, new Set(["--project", "--out", "--remote"]));
      const credentials = remoteCredentials();
      const result = await pull({
        project: required2(options, "--project"),
        out: required2(options, "--out"),
        remote: optional2(options, "--remote") ?? defaultRemote,
        env: process.env,
        credentials
      });
      process.stdout.write(scrub(formatResult(result, options.json)));
      return;
    }
    case "init": {
      const options = parseOptions(argv, new Set(["--root", "--project", "--source"]));
      writeResult(initializeProject({
        root: required2(options, "--root"),
        project: required2(options, "--project"),
        source: required2(options, "--source")
      }), options.json);
      return;
    }
    case "bootstrap": {
      const options = parseOptions(argv, new Set(["--root", "--project", "--source", "--bundle"]));
      const bundlePath = optional2(options, "--bundle");
      writeResult(bootstrapSample({
        root: required2(options, "--root"),
        project: required2(options, "--project"),
        source: required2(options, "--source"),
        ...bundlePath === undefined ? {} : { bundlePath }
      }), options.json);
      return;
    }
    case "create": {
      const options = parseOptions(argv, new Set(["--root", "--project", "--spec"]));
      writeResult(createSpec({
        root: required2(options, "--root"),
        project: required2(options, "--project"),
        specPath: required2(options, "--spec")
      }), options.json);
      return;
    }
    case "export-series": {
      const options = parseOptions(argv, new Set(["--session-root", "--project", "--spec-dir"]));
      writeResult(exportSeries({
        sessionRoot: required2(options, "--session-root"),
        project: required2(options, "--project"),
        specDirectory: required2(options, "--spec-dir")
      }), options.json);
      return;
    }
    case "extend":
    case "refresh":
    case "restore":
      runSpecCommand(command, argv);
      return;
    case "validate": {
      const options = parseOptions(argv, new Set(["--spec"]));
      const result = validateSpec(required2(options, "--spec"));
      writeResult({
        valid: true,
        artifactId: result.spec.artifactId,
        revision: result.spec.revision,
        specSha256: result.sha256
      }, options.json);
      return;
    }
    case "authoring-schema": {
      const options = parseOptions(argv, new Set);
      writeResult(interactiveAuthoringJsonSchema(), options.json);
      return;
    }
    case "review-learning": {
      const options = parseOptions(argv, new Set(["--spec"]));
      writeResult(reviewLearningSpec(required2(options, "--spec")), options.json);
      return;
    }
    case "compile-authoring": {
      const options = parseOptions(argv, new Set(["--spec"]));
      writeResult(compileInteractiveAuthoringDocument(readJson(required2(options, "--spec"))), options.json);
      return;
    }
    case "contract": {
      const options = parseOptions(argv, new Set(["--fixture"]));
      const fixture = required2(options, "--fixture");
      parseVisualNoteSpec(readJson(fixture));
      writeResult({
        contractVersion: 1,
        sentinel: "VISUAL_LEARNING_CONTRACT_OK",
        fixtureSha256: sha256(readFileSync15(fixture))
      }, options.json);
      return;
    }
    case "help":
      if (argv.length !== 0)
        throw new InputError("help accepts no options");
      process.stdout.write(help);
      return;
    default:
      throw new InputError(`unknown command: ${command}`);
  }
}
async function main() {
  const argv = Bun.argv.slice(2);
  const first = argv[0];
  if (first === "--help" || first === "-h") {
    if (argv.length !== 1)
      throw new InputError("help accepts no options");
    process.stdout.write(help);
    return;
  }
  if (first === undefined)
    throw new InputError("a command is required; use --help");
  await run3(first, argv.slice(1));
}
try {
  await main();
} catch (error) {
  if (error instanceof CollisionError || error instanceof ConflictError) {
    process.stderr.write(scrub(`visual-note: ${error.message}
`));
    process.exit(3);
  }
  if (error instanceof RuntimeError) {
    process.stderr.write(scrub(`visual-note: ${error.message}
`));
    process.exit(4);
  }
  if (error instanceof InputError || error instanceof ZodError || error instanceof SyntaxError || error instanceof TypeError) {
    process.stderr.write(scrub(`visual-note: ${error.message}
`));
    process.exit(2);
  }
  if (redact !== null) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(scrub(`visual-note: unexpected error: ${detail}
`));
    process.exit(1);
  }
  throw error;
}
