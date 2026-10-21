import { describe, expect, it } from "vitest";
import { addressInName, cleanSourcePath, findFunction, functionNames, highlightLine, maskNonCode } from "./source";

const file = `#include "common.h"

extern long func_00116F68(int arg0, int arg1, int arg2);

/* atoi, from newlib.
   Calls strtol. */
int func_00112380(int arg0) {
    return (int)func_00116F68(arg0, 0, 10); /* func_00112380( in a comment { */
}

// helper
static void
func_00112400(char *s)
{
    const char *x = "func_00112400(";
    if (s) { *s = '}'; }
}

INCLUDE_ASM("asm/nonmatchings/core/00112380", func_00112468);
LINKER_REMNANT("asm/remnants/core_text", func_00112470);

int func_0011B4C8_r(int a) __asm__("func_0011B4C8");
int func_0011B4C8_r(int a) {
    return a;
}

class Player {
  public:
    void Update(float dt) const { tick(dt); }
};
`;
const lines = file.split("\n");
const show = (r: ReturnType<typeof findFunction>) => (r ? lines.slice(r.start - 1, r.end).join("\n") : null);

describe("findFunction", () => {
  it("finds a definition with its comment, skipping declarations, calls and comments", () => {
    const r = findFunction(file, "func_00112380");
    expect(r?.kind).toBe("c");
    expect(show(r)).toMatch(/^\/\* atoi, from newlib\.[\s\S]*int func_00112380\(int arg0\) \{[\s\S]*\n\}$/);
  });

  it("finds a definition whose return type is on the line before, and isn't fooled by braces in literals", () => {
    const r = findFunction(file, "func_00112400");
    expect(show(r)).toBe(`// helper
static void
func_00112400(char *s)
{
    const char *x = "func_00112400(";
    if (s) { *s = '}'; }
}`);
  });

  it("points at the assembly a function still is", () => {
    expect(findFunction(file, "func_00112468")).toEqual({ kind: "asm", start: 19, end: 19 });
    expect(findFunction(file, "func_00112470")).toEqual({ kind: "asm", start: 20, end: 20 });
  });

  it("follows an asm label to the C name it was written under", () => {
    expect(show(findFunction(file, "func_0011B4C8"))).toBe("int func_0011B4C8_r(int a) {\n    return a;\n}");
  });

  it("finds C++ methods by their qualified or plain name", () => {
    expect(show(findFunction(file, "Player::Update"))).toContain("void Update(float dt) const { tick(dt); }");
  });

  it("says when it can't find a function", () => {
    expect(findFunction(file, "func_00116F68")).toBeNull(); // only declared and called
    expect(findFunction(file, "nope")).toBeNull();
  });

  it("masks comments and strings but keeps line breaks", () => {
    const m = maskNonCode('a /* {\n} */ "}" b');
    expect(m.split("\n")).toHaveLength(2);
    expect(m).not.toMatch(/[{}"]/);
  });
});

describe("findFunction, other ways projects write functions", () => {
  const more = `#include "common.h"

void caller(void) {
    if (later(1)) { return; }
}

int later(int x) {
    return x;
}

int gl_func_0001EE78(dl, a1, a2)
    int *dl;
    int a1, a2;
{
    return a1;
}

asm(".text\\n\\t.globl func_80034E60\\nfunc_80034E60:\\n\\t"
    "addiu $sp, $sp, -0x18\\n\\t"
    "jr $ra\\n");

namespace game {
// FUNCTION: GAME 0x10901710
int GetStaticClassADifficultyInfo() {
    return 3;
}
}

// @retail 0x9cbc0
void Unnamed_9cbc0(void) {
}
`;
  const ls = more.split("\n");
  const at = (r: ReturnType<typeof findFunction>) => (r ? ls.slice(r.start - 1, r.end).join("\n") : null);

  it("finds definitions, not calls inside other functions", () => {
    expect(at(findFunction(more, "later"))).toBe("int later(int x) {\n    return x;\n}");
  });
  it("finds old-style C definitions", () => {
    expect(at(findFunction(more, "gl_func_0001EE78"))).toMatch(/^int gl_func_0001EE78\(dl, a1, a2\)[\s\S]*return a1;\n\}$/);
  });
  it("finds functions still written as an asm block", () => {
    expect(findFunction(more, "func_80034E60")).toEqual({ kind: "asm", start: 18, end: 20 });
  });
  it("finds a function by the address in its marker comment, inside a namespace", () => {
    expect(at(findFunction(more, "?Mangled@@YAHXZ", 0x10901710))).toMatch(
      /^\/\/ FUNCTION: GAME 0x10901710\nint GetStaticClassADifficultyInfo/,
    );
    expect(at(findFunction(more, "function_9cbc0", addressInName("function_9cbc0")))).toBe(
      "// @retail 0x9cbc0\nvoid Unnamed_9cbc0(void) {\n}",
    );
  });
  it("finds a namespaced definition by its demangled name", () => {
    expect(
      findFunction(more, functionNames("?GetStaticClassADifficultyInfo@@YAHXZ", "int __cdecl GetStaticClassADifficultyInfo(void)"))?.kind,
    ).toBe("c");
  });
});

describe("functionNames", () => {
  it("reads names out of demangled signatures and MSVC manglings", () => {
    expect(functionNames("?Get@ULock@@SAPAVUClass@@PBD@Z", "public: static class UClass * __cdecl ULock::Get(char const *)")).toEqual([
      "ULock::Get",
      "Get",
    ]);
    expect(functionNames("??0Class_10e56ab0@@QAE@XZ")).toEqual(["Class_10e56ab0::Class_10e56ab0", "Class_10e56ab0"]);
    expect(functionNames("??1Foo@@QAE@XZ")).toEqual(["Foo::~Foo", "~Foo"]);
    expect(functionNames("func_00112380")).toEqual(["func_00112380"]);
  });
  it("finds addresses in generated names", () => {
    expect(addressInName("func_00112380")).toBe(0x112380);
    expect(addressInName("function_9cbc0")).toBe(0x9cbc0);
    expect(addressInName("main_game_loop")).toBeNull();
  });
});

describe("cleanSourcePath", () => {
  it("allows plain relative paths only", () => {
    expect(cleanSourcePath("src/core/00112380.c")).toBe("src/core/00112380.c");
    expect(cleanSourcePath("./src\\game\\a.cpp")).toBe("src/game/a.cpp");
    for (const bad of ["/etc/passwd", "../secrets", "src/../../x", "C:/x.c", "", null]) expect(cleanSourcePath(bad)).toBeNull();
  });
});

describe("highlightLine", () => {
  it("splits a line into tokens and carries block comments over", () => {
    expect(highlightLine('int x = 0x10; // "hi"', false).tokens).toEqual([
      ["type", "int"],
      ["plain", " x = "],
      ["number", "0x10"],
      ["plain", "; "],
      ["comment", '// "hi"'],
    ]);
    const a = highlightLine("return 1; /* starts", false);
    expect(a.inComment).toBe(true);
    expect(highlightLine("ends */ x", true).tokens[0]).toEqual(["comment", "ends */"]);
    expect(highlightLine('#include "a.h"', false).tokens).toEqual([["preproc", '#include "a.h"']]);
  });
});

describe("candidates", () => {
  it("tries the file starting nearest below the function's address first", async () => {
    const { candidates } = await import("./source-fetch");
    const files = ["d/vendor_002CF2C0.c", "d/help_00204AC0.c", "d/misc.c", "d/zz_0032C000.c", "d/func_L05_0032BBF0.c"];
    expect(candidates(files, "func_L05_0032BBF0")[0]).toBe("d/func_L05_0032BBF0.c");
    expect(candidates(files.slice(0, 4), "func_L05_0032BBF0")).toEqual([
      "d/vendor_002CF2C0.c",
      "d/help_00204AC0.c",
      "d/misc.c",
      "d/zz_0032C000.c",
    ]);
  });
});

describe("guessUnitFiles", () => {
  it("finds a unit's file from its name when the report gives no source_path", async () => {
    const { guessUnitFiles } = await import("./source-fetch");
    const files = [
      "src/main/audio/akao_sequencer.c",
      "include/main/audio/akao_sequencer.h",
      "tools/akao_sequencer.py.c",
      "src/field/akao_sequencer.c",
      "asm/main/audio/akao_sequencer.s",
    ];
    expect(guessUnitFiles(files, "main/audio/akao_sequencer")).toEqual([
      "src/main/audio/akao_sequencer.c",
      "include/main/audio/akao_sequencer.h",
      "asm/main/audio/akao_sequencer.s",
      "src/field/akao_sequencer.c",
    ]);
    expect(guessUnitFiles(files, "auto_03_80008D40_text")).toEqual([]);
  });
});

describe("loadSource and renamed functions", () => {
  it("follows #define names from the headers a file includes", async () => {
    const { vi } = await import("vitest");
    const repo: Record<string, string> = {
      "src/game/hero.c": '#include "common.h"\n\nvoid Hero_Update(void) {\n    tick();\n}\n',
      "include/common.h": '#include "names.h"\n',
      "include/names.h": "#define Hero_Update      func_0023BBE8\n#define Other func_00000001\n",
    };
    vi.stubGlobal("fetch", async (url: string) => {
      const path = decodeURIComponent(String(url).split("/").slice(6).join("/"));
      return repo[path] !== undefined ? new Response(repo[path]) : new Response("", { status: 404 });
    });
    try {
      const { loadSource } = await import("./source-fetch");
      const v = await loadSource({ owner: "o", repo: "r", installationId: null }, "abc", "src/game/hero.c", "func_0023BBE8");
      expect(v).toMatchObject({ kind: "c", path: "src/game/hero.c", start: 3, end: 5 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
