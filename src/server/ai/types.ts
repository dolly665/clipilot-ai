/** 一次文字生成请求。task 是提示词名，fake 提供方据此给出对应的假结果。 */
export type CompleteRequest = {
  task: string;
  system: string;
  user: string;
  maxTokens?: number;
};

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompleteRequest): Promise<string>;
}

export class AiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiError";
  }
}
