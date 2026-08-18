export class InputError extends Error {
  readonly name = "InputError";
  constructor(
    readonly detail: string,
    options?: ErrorOptions,
  ) {
    super(detail, options);
  }
}

export class CollisionError extends Error {
  readonly name = "CollisionError";
  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`refusing dirty target collision: ${path}`, options);
  }
}

export class ConflictError extends Error {
  readonly name = "ConflictError";
  constructor(
    readonly detail: string,
    options?: ErrorOptions,
  ) {
    super(detail, options);
  }
}

export class RuntimeError extends Error {
  readonly name = "RuntimeError";
  constructor(
    readonly detail: string,
    options?: ErrorOptions,
  ) {
    super(detail, options);
  }
}
