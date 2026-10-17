import { describe, expect, it } from "vitest";
import { checkPort, portHost } from "./ports";

const ok = { name: " OpenRAC ", url: "github.com/OpenRAC/OpenRAC", platforms: ["windows", "linux", "linux", "amiga"], status: "progress" };

describe("checkPort", () => {
  it("cleans a valid port", () => {
    expect(checkPort(ok, [])).toEqual({
      port: {
        name: "OpenRAC",
        url: "https://github.com/OpenRAC/OpenRAC",
        platforms: ["windows", "linux"],
        status: "progress",
        version: null,
        note: null,
      },
    });
  });
  it("refuses links that aren't https, and missing fields", () => {
    expect(checkPort({ ...ok, url: "http://example.com" }, [])).toHaveProperty("error");
    expect(checkPort({ ...ok, url: "javascript:alert(1)" }, [])).toHaveProperty("error");
    expect(checkPort({ ...ok, url: "https://user:pw@example.com" }, [])).toHaveProperty("error");
    expect(checkPort({ ...ok, name: "" }, [])).toHaveProperty("error");
    expect(checkPort({ ...ok, platforms: [] }, [])).toHaveProperty("error");
    expect(checkPort({ ...ok, status: "done" }, [])).toHaveProperty("error");
  });
  it("only takes versions the project has", () => {
    expect(checkPort({ ...ok, version: "SCES_509.16" }, ["SCES_509.16"])).toMatchObject({ port: { version: "SCES_509.16" } });
    expect(checkPort({ ...ok, version: "nope" }, ["SCES_509.16"])).toHaveProperty("error");
  });
});

describe("portHost", () => {
  it("shortens forge links to owner/repo and others to the host", () => {
    expect(portHost("https://github.com/OpenRAC/OpenRAC/releases")).toBe("github.com/OpenRAC/OpenRAC");
    expect(portHost("https://www.example.com/port")).toBe("example.com");
  });
});
