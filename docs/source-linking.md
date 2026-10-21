# Linking source code

On a project's unit map, **View source** on an opened unit shows its file, and selecting a function
shows that function's code, both read from the project's GitHub repository at the commit the
report came from. This page is for maintainers (and the coding assistants they hand the job to)
who want that to work for every function: what ByteMatch looks for, how to set a repository up
for it, how to check the result, and what each message means.

Nothing here changes how progress is measured. A function ByteMatch can't find still counts
exactly as the report says; it only can't show its code.

## How a lookup works

ByteMatch never builds anything. For a function in a unit it has the report's facts and the
repository, and goes through these steps in order, stopping at the first that finds it.

### 1. Which file

| The report's unit has                  | ByteMatch reads                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata.source_path` naming a file   | that file.                                                                                                                                                                                                                                                                    |
| `metadata.source_path` naming a folder | the folder's source files (up to 200), best guesses first: files named after the function, then, when file names carry the address their code starts at (`help_0023BBE8.c`, `vendor_002B5990.c`) and the function's name carries its own, the file starting nearest below it. |
| no `source_path`                       | the repository's files whose path, without the extension, ends with the unit's name: unit `main/audio/akao` matches `src/main/audio/akao.c`. C and C++ files come before headers and assembly.                                                                                |
| nothing found in any of those          | GitHub's code search for the function's name in the repository, as a last resort (see [Limits](#limits)).                                                                                                                                                                     |

Paths are relative to the repository root, at the report's commit.

### 2. Which name

The report names functions by their symbol (`func_0023BBE8`, `?Update@Player@@QAEXM@Z`), and gives a
demangled name when the symbol is mangled. ByteMatch looks for the plain and the qualified name
(`Player::Update` and `Update`), read out of demangled signatures (`public: void __thiscall
Player::Update(float)`) and, when nothing demangled it, out of MSVC's own mangling (`??0Class@@`
for a constructor, `??1Class@@` for a destructor).

### 3. What counts as the function

In each file, in this order:

1. **A definition under one of those names**: `int func_0023BBE8(int a) { ... }`, the return type on
   the line before, a C++ method (inline in its class or `Player::Update` outside it), or an
   old-style C definition whose parameter types follow the list. It must sit outside any function
   body, so a call inside another function never passes for it; namespace, `extern "C"` and class
   bodies don't count as function bodies. The comment directly above is shown with it.
2. **An asm label naming the symbol**: `int helper_r(int a) __asm__("func_0023BBE8");` ties the symbol to
   a C name; ByteMatch then shows `helper_r`'s definition.
3. **A `#define` naming the symbol**: `#define Hero_Update func_0023BBE8` in a header the file includes
   (directly or through other headers), for projects that rename functions in source while the
   build still emits the original symbols. ByteMatch then looks for `Hero_Update`. See
   [Renamed functions](#renamed-functions).
4. **A comment carrying the function's address**, followed within a dozen lines by a definition of
   any name: reccmp's `// FUNCTION: GAME 0x10901710`, `// @retail 0x9cbc0`, `/* 0x0023BBE8 */`. The
   address comes from the report (`virtual_address`), or from a name that ends in one
   (`func_0023BBE8`, `fn_80008D40`, `function_9cbc0`).
5. **A top-level `asm(...)` block that defines the label**: `asm(".globl func_80034E60\nfunc_80034E60: ...")`,
   shown as assembly.
6. **A line that includes it as assembly**: any all-caps macro call naming it, such as
   `INCLUDE_ASM("asm/nonmatchings/core", func_0023BBE8);`, `GLOBAL_ASM(...)`, `#pragma GLOBAL_ASM(...)`,
   `LINKER_REMNANT(...)`. Shown as "Not written in C yet".

If none of these finds it, the page says it couldn't find the function and links the file.

### Limits

- Files over 4 MB are skipped, and one lookup reads at most 8 MB of a folder.
- Following `#include`, ByteMatch looks beside the including file and under `include/`, `src/`,
  `inc/` and the repository root, up to four levels deep and 40 headers. Include paths set only in
  the build (`-I some/dir`) aren't known to it.
- Code search allows a handful of lookups a minute for the whole site, and searches the default
  branch, not the report's commit. Don't rely on it: give units a `source_path` and keep names
  findable.
- Public repositories are read without the GitHub App; private ones need the App installed.

## Setting a repository up

Work through these in order. Each one fixes a class of "couldn't find" for good.

### 1. Say where each unit's source is

objdiff's project file (`objdiff.json`) describes each unit; ByteMatch reads `metadata.source_path`
from the report, which `objdiff-cli report generate` copies from it.

```json
{
  "units": [
    {
      "name": "game/player",
      "target_path": "build/SCES_509.16/asm/game/player.o",
      "base_path": "build/SCES_509.16/src/game/player.o",
      "metadata": {
        "source_path": "src/game/player.c",
        "progress_categories": ["game"],
        "complete": false
      }
    }
  ]
}
```

- **dtk-template** fills it in from each `Object(...)` in `configure.py`; check that generated units
  have it.
- **A hand-written generator** (a `configure.py`, `objdiff.py` or similar that writes
  `objdiff.json`): set `metadata.source_path` to the C file each unit's object is built from, the
  same path the build's compile rule uses, relative to the repository root.
- **A unit built from several files** (one original object split into many source files): point
  `source_path` at their folder (`src/overlays/l06_blarg`). Name the files after the address their
  code starts at (`help_0023BBE8.c`) and ByteMatch opens the right one first.
- **Paths must be relative**, with forward slashes, no `..`, and exist at the commit the report is
  built from.

Change the generator, not its output, if `objdiff.json` is generated.

### 2. Keep the report's names findable

The report's function names come from the symbols in the original object (the target). Source
that defines a function under exactly that name needs nothing more. When the source calls it
something else, use one of these, in order of preference:

| The project                                                      | Do this                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Renames functions with macros (`#define Readable func_0023BBE8`) | Nothing, if every source file includes the header (directly or through `common.h`) and the header is under `include/`, `src/` or `inc/`.  |
| Writes a function under another C name for matching reasons      | Tie them with an asm label: `int helper_r(int) __asm__("func_0023BBE8");` before the definition.                                          |
| Names functions freely, or is a PC/Xbox project with reccmp      | Put the address in a comment directly above each function: `// FUNCTION: GAME 0x0023BBE8` (reccmp style) or `// 0x0023BBE8`.              |
| Ties names in the linker script (`func_0011DFE8 = __divdi3;`)    | ByteMatch doesn't read linker scripts: add an address comment above the C function (`/* 0x0011DFE8 */`), typical for libgcc and SDK code. |
| Still has the function as assembly                               | Keep the include line naming the symbol: `INCLUDE_ASM("asm/nonmatchings/...", func_0023BBE8);`.                                           |

#### Renamed functions

Projects that rename functions often keep the build's symbols unchanged with a header of macros,
so the report keeps calling the function `func_L06_0023BBE8` while the source says
`HeroL06_UpdateStateTransitions`:

```c
/* include/names.h */
#define HeroL06_UpdateStateTransitions      func_L06_0023BBE8

/* include/common.h */
#include "names.h"

/* src/overlays/l06_blarg/help_0023BBE8.c */
#include "common.h"
void HeroL06_UpdateStateTransitions(void) { ... }
```

ByteMatch follows `#include "common.h"` to `names.h`, finds the `#define`, and shows
`HeroL06_UpdateStateTransitions`. The `#define` must be a plain object-like macro on one line
(`#define NEW OLD`, a trailing comment is fine); function-like macros and names built by token
pasting aren't followed. Keep the header reachable through quoted includes (`#include "names.h"`,
not `<names.h>`), from a folder ByteMatch tries.

### 3. Build reports from pushed commits

ByteMatch reads the source at the commit the report names. A report uploaded from a local build of
an unpushed commit, or from a branch later rebased away, points at a commit GitHub doesn't have,
and every lookup fails with "isn't in the repository". CI reports from the default branch are
always fine.

### 4. Make the repository readable

Public repositories work as they are. For a private one, install the instance's GitHub App on it
([GitHub App](getting-started.md#github-app)).

## Checking a project

Once a CI run with your changes has been read (the project page shows its commit), check it with
the script in ByteMatch's repository, which asks the site the same thing the project page does:

```sh
curl -O https://raw.githubusercontent.com/Veradictus/ByteMatch/master/scripts/check-source-links.py
python3 check-source-links.py <owner>/<repo>                     # two functions per unit
python3 check-source-links.py <owner>/<repo> --per-unit 5        # more of each unit
python3 check-source-links.py <owner>/<repo> --unit game/player --per-unit 0   # every function of one unit
python3 check-source-links.py <owner>/<repo> --version GALE01 --json
```

It prints how many sampled functions were found, how many units have no `source_path`, and each
miss with its unit, function and file, and exits with 1 if anything was missed. Sampling keeps it
light; checking every function of a large project makes thousands of requests, so use `--unit` for
a full pass over the units you changed.

One function by hand, through the [source API](api.md#source):

```sh
curl -s "https://bytematch.dev/api/v1/projects/<owner>/<repo>/source?unit=game/player&function=func_0023BBE8" | jq '{kind, path, start, end, error}'
```

`kind` is `c` or `asm` when it was found; `not-found` says which file was searched (`path`).

ByteMatch keeps what it fetched from a commit, and the API's answers are cached for a day. Check
against a new commit after changing the repository, not the one you checked before.

## Messages on the project page

| Message                                                                                      | Meaning and fix                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Couldn't find `fn` in `path` at this commit                                                  | The file was read but nothing in it names the function in a way listed [above](#3-what-counts-as-the-function). Use one of the fixes in [Keep the report's names findable](#2-keep-the-reports-names-findable).             |
| `path` isn't in the repository at `abc1234`                                                  | `source_path` is wrong (a typo, a path relative to something other than the root, a file since moved) or the commit isn't on GitHub. Fix the path in `objdiff.json`'s generator, or build reports only from pushed commits. |
| This project's report doesn't say where this unit's source is, and no file is named after it | No `source_path`, and no file path ends with the unit's name. Add `source_path` ([step 1](#1-say-where-each-units-source-is)).                                                                                              |
| Not written in C yet                                                                         | Found as an assembly include or asm block. Nothing to fix.                                                                                                                                                                  |
| GitHub didn't answer just now                                                                | A network or rate-limit hiccup on the instance's side. Try again later.                                                                                                                                                     |

Some functions have no source to find, and "couldn't find" is the honest answer for them:
compiler-generated helpers (`` `scalar deleting destructor' ``, exception handlers, linker thunks),
gaps between splits, and code still only in automatically split assembly that no source file
names.

## For coding assistants

Give this to an assistant in the project's repository to audit and fix source linking. It assumes
the project is already on ByteMatch; [Setting up with an AI assistant](setup-prompt.md) covers
getting there.

```text
Make every function's source findable on ByteMatch (https://bytematch.dev) for this
repository, following https://bytematch.dev/docs/source-linking. Don't change what the build
produces or any matching code; only objdiff.json's generator, comments and headers.

Project on ByteMatch: <owner>/<repo>    Versions: <versions>

1. Run the checker (python3 check-source-links.py <owner>/<repo> --per-unit 3, from
   https://raw.githubusercontent.com/Veradictus/ByteMatch/master/scripts/check-source-links.py)
   and keep its output as the baseline.
2. Units without source_path: find where objdiff.json is written and set
   metadata.source_path for every unit to the file (or, for units split over many files, the
   folder) its object is compiled from, relative to the repository root.
3. Each miss with a source_path: open the file at that path and find out how the function is
   written there. Fix by the table in "Keep the report's names findable": make sure rename
   headers are reachable by quoted #include from the file; add asm labels for C written under
   another name; add an address comment (// 0x<address>) above functions named freely.
   Leave compiler-generated helpers and assembly-only splits alone.
4. Build and confirm the build output is unchanged (same checksums or the same objdiff
   report), commit, push, and wait for CI to finish and ByteMatch to read the run.
5. Run the checker again on the new commit and report before and after, with the misses
   that remain and why each can't be fixed.
```
