# Linking source code

On a project's unit map, **View source** on an opened unit shows its file, and selecting a function
shows that function's code, both read from the project's GitHub repository at the commit the
report came from. This page explains how ByteMatch finds a function, what (little) a repository
needs for every function to be found, how to check a project, and what each message means. It's
written for maintainers and for the coding assistants they hand the job to.

Nothing here changes how progress is measured. A function ByteMatch can't show still counts
exactly as the report says.

## How a lookup works

ByteMatch never builds anything. For a function it has the report's facts (the function's name,
its demangled name, its address, its unit's `source_path`) and the repository at the report's
commit. It looks in three places, in order:

1. **The unit's own files.** The file or folder `source_path` names, or, without one, files whose
   path ends with the unit's name (unit `main/audio/akao` → `src/main/audio/akao.c`). In a folder,
   files named after the address their code starts at (`help_0023BBE8.c`) are read nearest first.
   For a project that says where its units are, this answers at once.
2. **The whole repository.** Once per commit, ByteMatch downloads the repository (one archive of a
   few megabytes for most decompilations) and indexes every function it defines, in every file,
   whatever the layout. The function is then found by name wherever it is, by any other name the
   source gives it, or by its address. `source_path` only decides between several copies.
3. **Nowhere.** When nothing in the repository defines the function or includes it as assembly, the
   page says the function isn't in the repository at that commit. That's the honest answer for
   code a project generates from the game at build time and only commits once decompiled.

### What counts as a function's code

In C and C++ files:

- **A definition**: `int func_0023BBE8(int a) { ... }`, with the return type on the line before or
  not, a C++ method inline in its class or as `Player::Update` outside it, or an old-style C
  definition whose parameter types follow the list. It must sit outside any function body
  (namespace, `extern "C"` and class bodies don't count as one), so a call or a declaration never
  passes for it. The comment directly above is shown with it.
- **A line including it as assembly**: any all-caps macro call naming it, such as
  `INCLUDE_ASM("asm/nonmatchings/core", func_0023BBE8);`, `GLOBAL_ASM(...)`, `#pragma GLOBAL_ASM(...)`,
  `LINKER_REMNANT(...)`. Shown as "Not written in C yet".
- **A top-level `asm(...)` block** defining its label (`asm(".globl func_80034E60\nfunc_80034E60: ...")`).

In assembly files (`.s`, `.asm`): its label, from a function marker (`glabel`, `thumb_func_start`,
`arm_func_start`, `.type name, %function`, `.ent`, `.func`), a label at the start of a line, or
an objdump listing's `002e1be0 <name>:`, up to the next function's. A file named after one symbol
(`asm/app/_ZN6GSFadeC1Ev.s`) is that function's, header comment included.

Build output is never indexed: anything under `build/`, `out/`, `.git/` or `node_modules/`.

### Which names

The report names a function by its symbol (`func_0023BBE8`, `?Update@Player@@QAEXM@Z`) and, when
it's mangled, gives a demangled name too. ByteMatch looks for:

- **The plain and the qualified name** (`Player::Update`, `Update`), read out of demangled
  signatures (`public: void __thiscall Player::Update(float)`) and, when nothing demangled it, out
  of MSVC's own mangling (`??0Class@@` is a constructor, `??1Class@@` a destructor).
- **Other names the source gives the symbol**, from any header or linker script in the
  repository:
  - `#define HeroL06_UpdateStateTransitions func_L06_0023BBE8`: an object-like macro on one line,
    a trailing comment allowed, in either order. The header needn't be included by the function's
    file, or by anything.
  - `func_0011DFE8 = __divdi3;` in a linker script (`*.ld`, `*.lds`, `*.lcf`, `*.ld.sh` and the
    like), as projects do for libgcc and SDK code.
  - `int helper_r(int) __asm__("func_0023BBE8");` next to the definition.
- **Its address**, in a comment above the definition: reccmp's `// FUNCTION: GAME 0x10901710`,
  `// @retail 0x9cbc0`, `/* 0x0023BBE8 */`. The address comes from the report (`virtual_address`), or
  from a name ending in one (`func_0023BBE8`, `fn_80008D40`, `function_9cbc0`).

### Limits

- A repository archive over 80 MB (one that commits game assets or builds, say) isn't indexed;
  lookups then read the unit's own files and use GitHub's code search, which allows only a few
  searches a minute across the site.
- Files over 4 MB are skipped.
- Public repositories are read without the GitHub App; private ones need the App installed.

## What a repository needs

For most projects, nothing: if the source defines a function under the name the report uses, or
includes it as assembly by that name, it's found wherever it is. These cover the rest.

### Commit the code the report is built from

ByteMatch reads the commit the report names. Code only in the build directory, assembly
generated from the game at build time, or a report built from an unpushed commit can't be shown.
CI reports from the default branch always point at a pushed commit.

### When the source uses other names

| The project                                                                   | Do this                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Renames functions with macros (`#define Readable func_0023BBE8`)              | Nothing: any header in the repository counts.                                              |
| Ties names in its linker script (`func_0011DFE8 = __divdi3;`)                 | Nothing: linker scripts are read.                                                          |
| Writes a function under another C name for matching reasons                   | An asm label (`__asm__("func_0023BBE8")`) or a `#define`, as above.                        |
| Names functions freely (PC, Xbox and reccmp projects)                         | An address comment above each function: `// FUNCTION: GAME 0x0023BBE8` or `// 0x0023BBE8`. |
| Maps names in its own tables (a TSV, a Python dict, a generated objdiff.json) | Generate a [names header](#a-names-header) from that table.                                |

#### A names header

A project whose report names functions differently from its source for reasons the source doesn't
show (one version's addresses in names while the C uses another's, a renaming step in its own
tools, one shared C function standing for copies in many levels) can say so in one place: commit
a header of `#define` lines tying each report name to its source name, generated from the table
the project already keeps. Either order works; report name first keeps it valid C when many report
names share one source name.

```c
/* include/bytematch_names.h: generated by tools/gen_bytematch_names.py; not included anywhere.
   The source name of each report symbol, for ByteMatch's source view. */
#define func_0037D100 func_00381140
#define func_L05_0038BE78 func_L01_0037EFC8
#define func_L17_0037D100 func_L01_0037EFC8
```

Nothing needs to include it, so it can't affect the build. Regenerate it in the same commit as the
table changes, or in CI before the report is built.

### Say where units are (optional, faster)

objdiff's `metadata.source_path` on each unit isn't needed to find a function any more, but it
makes lookups instant and decides which copy to show when the repository has several (one per
version, say).

```json
{
  "name": "game/player",
  "target_path": "build/SCES_509.16/asm/game/player.o",
  "base_path": "build/SCES_509.16/src/game/player.o",
  "metadata": { "source_path": "src/game/player.c" }
}
```

dtk-template fills it in from `configure.py`; a hand-written generator should set it to the file
(or, for a unit split over many files, the folder) each unit's object is built from, relative to
the repository root.

## Checking a project

Once a CI run has been read (the project page shows its commit), check it with the script in
ByteMatch's repository, which asks the site exactly what the project page does:

```sh
curl -O https://raw.githubusercontent.com/Veradictus/ByteMatch/master/scripts/check-source-links.py
python3 check-source-links.py <owner>/<repo>                     # two functions per unit
python3 check-source-links.py <owner>/<repo> --per-unit 5        # more of each unit
python3 check-source-links.py <owner>/<repo> --unit game/player --per-unit 0   # every function of one unit
python3 check-source-links.py <owner>/<repo> --version GALE01 --json
```

It prints how many sampled functions were found, how many are absent from the repository, how many
units have no `source_path`, and each miss with its unit, function and file. It exits with 1 when
something present couldn't be found. The first lookup of a commit builds its index, so the first
request can take a few seconds.

One function by hand, through the [source API](api.md#source):

```sh
curl -s "https://bytematch.dev/api/v1/projects/<owner>/<repo>/source?unit=game/player&function=func_0023BBE8" | jq '{kind, path, start, end, error}'
```

`kind` is `c` or `asm` when found, `absent` when nothing in the repository has it, `not-found` when
the index couldn't be built and the unit's files didn't have it.

The API's answers are cached for a day. Check a new commit after changing the repository.

## Messages on the project page

| Message                                                                         | Meaning and fix                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fn` isn't in the repository at this commit                                     | Nothing defines it or includes it as assembly, under any name ByteMatch knows. If it is there under another name, tie the names ([table](#when-the-source-uses-other-names)). |
| Couldn't find `fn` in `path` at this commit                                     | Only when the repository couldn't be indexed (too big, or unreachable): the unit's files didn't have it.                                                                      |
| `path` isn't in the repository at `abc1234`                                     | `source_path` names a file that doesn't exist at that commit, or the commit isn't on GitHub.                                                                                  |
| This report came from commit `abc1234`, which isn't in the repository on GitHub | The report was built from a commit that was never pushed, or was rebased away. Build reports in CI from pushed commits.                                                       |
| This project's report doesn't say where this unit's source is…                  | Viewing a whole unit (no function picked) needs its file: give units a `source_path`.                                                                                         |
| Not written in C yet                                                            | Found as an assembly include, block or file. Nothing to fix.                                                                                                                  |
| GitHub didn't answer just now                                                   | A network or rate-limit hiccup on the instance's side. Try again later.                                                                                                       |

Some functions have no code to show by nature: compiler-generated helpers
(`` `scalar deleting destructor' ``, exception handlers, linker thunks) and gaps between splits.

## For coding assistants

Give this to an assistant in the project's repository. It assumes the project is on ByteMatch;
[Setting up with an AI assistant](setup-prompt.md) covers getting there.

```text
Make every function's source findable on ByteMatch (https://bytematch.dev) for this
repository, following https://bytematch.dev/docs/source-linking. Don't change what the build
produces or any matching code.

Project on ByteMatch: <owner>/<repo>    Versions: <versions>

1. Run the checker (python3 check-source-links.py <owner>/<repo> --per-unit 3, from
   https://raw.githubusercontent.com/Veradictus/ByteMatch/master/scripts/check-source-links.py)
   and keep its output as the baseline.
2. For each function reported absent or missed, find out whether its code is in the
   repository under another name. If the project maps names in its own tables or tools, add
   a generator that writes a names header (#define <source name> <report name>, one per
   line, included by nothing) from that table, run it, and commit the header. If functions
   are named freely, add address comments (// 0x<address>) above them instead.
3. Leave alone what isn't in the repository: assembly generated at build time,
   compiler-generated helpers, gaps between splits.
4. Optionally set metadata.source_path for every unit in objdiff.json's generator.
5. Build and confirm the build output is unchanged, commit, push, wait for CI and for
   ByteMatch to read the run, then run the checker again and report before and after.
```
