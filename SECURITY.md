# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions or pull requests.**

Report them privately in one of two ways:

- **GitHub:** use [Report a vulnerability](https://github.com/tentislabs/tent.js/security/advisories/new) on the Security tab of this repository.
- **Email:** write to [security@tentjs.com](mailto:security@tentjs.com).

Please include as much of the following as you can:

- the version of Tent.js and the operating system it runs on,
- the type of issue and its impact: what an attacker could do,
- the steps to reproduce it, or a minimal project that shows it,
- whether the issue is already known or disclosed anywhere else.

## What Happens Next

1. We acknowledge your report within three business days.
2. We confirm the issue, assess its severity, and keep you informed of our progress.
3. We prepare a fix and release it, then publish a security advisory on GitHub.
4. We credit you in the advisory and the release notes, unless you ask us not to.

We ask that you give us a reasonable time to release a fix before you disclose the issue publicly, and we will agree on a disclosure date with you.

## Supported Versions

Security fixes are released for the latest minor version of the current major version.

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Getting Fixes

- Run `npm install -g tentjs@latest` to update the `tent` command, and `npm install tentjs@latest` in a project.
- Every `tent` command tells you in one line when the installed version has a known security problem, and which version fixes it.

## Reporting Bugs

Bugs that are not security issues go to [GitHub Issues](https://github.com/tentislabs/tent.js/issues).
