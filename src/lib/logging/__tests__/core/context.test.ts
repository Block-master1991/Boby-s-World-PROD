import { ContextManager } from "../../core/LogContext";

describe("ContextManager", () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    // Get singleton instance
    contextManager = ContextManager.getInstance();
  });

  describe("createContext", () => {
    it("should generate correlationId if missing", () => {
      const context = contextManager.createContext({});
      expect(context.correlationId).toBeDefined();
      expect(typeof context.correlationId).toBe("string");
    });

    it("should use provided correlationId", () => {
      const context = contextManager.createContext({ correlationId: "my-id" });
      expect(context.correlationId).toBe("my-id");
    });

    it("should merge initial context", () => {
      const context = contextManager.createContext({ userId: "u1" });
      expect(context.userId).toBe("u1");
    });
  });

  describe("Headers Propagation", () => {
    it("should extract standard headers", () => {
      const headers = {
        "x-correlation-id": "cid-123",
        "x-user-id": "uid-456",
      };
      const context = contextManager.extractFromHeaders(headers);
      expect(context.correlationId).toBe("cid-123");
      expect(context.userId).toBe("uid-456");
    });

    it("should extract from Headers object", () => {
      const headers = new Headers();
      headers.set("x-correlation-id", "cid-header");
      const context = contextManager.extractFromHeaders(headers);
      expect(context.correlationId).toBe("cid-header");
    });

    it("should inject headers from context", () => {
      const context = { correlationId: "test-out", traceId: "tr-1" };
      const headers = contextManager.toHeaders(context);

      expect(headers["x-correlation-id"]).toBe("test-out");
      expect(headers["x-request-id"]).toBe("test-out");
      expect(headers["x-trace-id"]).toBe("tr-1");
    });
  });

  describe("Context Storage (Shim/Mock Behavior)", () => {
    it("should run callback with context", async () => {
      const context = { correlationId: "async-test" };
      const result = await contextManager.runWithContext(context, () => {
        const current = contextManager.getCurrentContext();
        expect(current?.correlationId).toBe("async-test");
        return "result";
      });
      expect(result).toBe("result");
    });
  });
});
