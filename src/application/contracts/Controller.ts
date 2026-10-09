/**
 * Transport-neutral HTTP controller. Driving adapters in `main` translate platform
 * events into this request shape, so controllers never depend on AWS types.
 */
export interface Controller<TResponseBody = unknown> {
  handle(request: Controller.Request): Promise<Controller.Response<TResponseBody>>;
}

export namespace Controller {
  export type Request<TBody = unknown> = {
    /** Parsed JSON body; `undefined` when the request has no body. */
    body: TBody;
    params: Record<string, string | undefined>;
    queryParams: Record<string, string | undefined>;
    headers: Record<string, string | undefined>;
  };

  export type Response<TBody = unknown> = {
    statusCode: number;
    body?: TBody;
  };
}
