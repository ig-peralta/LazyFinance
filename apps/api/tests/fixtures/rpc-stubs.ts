type AsyncMethod = (...args: never[]) => PromiseLike<unknown>;

/** Preserve arguments/results without pretending a fake creates tRPC-branded promises. */
export type AsyncStub<Method extends AsyncMethod> = (
  ...args: Parameters<Method>
) => Promise<Awaited<ReturnType<Method>>>;

export type RpcStubs<Router> = {
  [Procedure in keyof Router]: {
    [Method in keyof Router[Procedure]]: Router[Procedure][Method] extends AsyncMethod
      ? AsyncStub<Router[Procedure][Method]>
      : never;
  };
};
