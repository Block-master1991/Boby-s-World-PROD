import { RateLimitMiddleware } from "../../middleware/RateLimitMiddleware";
import { LogLevel } from "../../core/LogLevel";

describe("RateLimitMiddleware", () => {
  let middleware: RateLimitMiddleware;

  beforeEach(() => {
    middleware = new RateLimitMiddleware({
      // Mock config
      perUser: { max: 2, windowMs: 1000 },
      enabled: true,
    });
    middleware.reset(); // clear state
  });

  it("should allow requests under limit", async () => {
    const res1 = await middleware.checkLimit("user1");
    const res2 = await middleware.checkLimit("user1");

    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true);
  });

  it("should forbid requests over limit", async () => {
    await middleware.checkLimit("user1");
    await middleware.checkLimit("user1");
    const res3 = await middleware.checkLimit("user1");

    expect(res3.allowed).toBe(false);
    expect(res3.remaining).toBe(0);
  });
});
