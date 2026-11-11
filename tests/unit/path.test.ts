import { expect, test } from 'claude-code/testing'

import { basename, joinPath, samePath, under } from '../../src/util/path'

test('a POSIX path joins onto the base, with . and .. resolved and stopping at the root', () => {
  expect(joinPath('/work/main', '../api')).toBe('/work/api')
  expect(joinPath('/work/main', '/tmp/x/./y')).toBe('/tmp/x/y')
  expect(joinPath('/work/main', 'a/b/')).toBe('/work/main/a/b')
  expect(joinPath('/', '..')).toBe('/')
})

test("a Windows path joins however it is spelled: a drive, a share, the base's drive or Git Bash's /c/", () => {
  expect(joinPath('C:\\work\\main', '..\\api')).toBe('C:\\work\\api')
  expect(joinPath('C:\\work\\main', '/c/Users/ana')).toBe('C:\\Users\\ana')
  expect(joinPath('C:\\work\\main', '\\temp')).toBe('C:\\temp')
  expect(joinPath('\\\\server\\share\\a', '..\\..\\b')).toBe('\\\\server\\share\\b')
  expect(joinPath('C:\\work', 'D:\\x')).toBe('D:\\x')
  expect(joinPath('d:/work/main', 'sub')).toBe('D:\\work\\main\\sub')
})

test('the same directory is the same whatever its case and slashes on Windows, and its trailing slash on POSIX', () => {
  expect(samePath('C:\\Work\\Main\\', 'c:/work/main')).toBe(true)
  expect(samePath('/work/main/', '/work/main')).toBe(true)
  expect(samePath('/Work', '/work')).toBe(false)
})

test("a path's last part, with either slash", () => {
  expect(basename('/work/api/')).toBe('api')
  expect(basename('C:\\work\\api')).toBe('api')
})

test('a path under a directory reads from it, with forward slashes; any other reads whole', () => {
  expect(under('/work/api', '/work/api/src/a.ts')).toBe('src/a.ts')
  expect(under('/work/api/', '/work/api/src/a.ts')).toBe('src/a.ts')
  expect(under('/work/api', '/work/api-bolt/src/a.ts')).toBe('/work/api-bolt/src/a.ts')
  expect(under('/work/api', '/work/api')).toBe('/work/api')
  expect(under('C:\\Work\\Api', 'c:/work/api/src\\a.ts')).toBe('src/a.ts')
  expect(under('C:\\work\\api', 'D:\\work\\api\\a.ts')).toBe('D:\\work\\api\\a.ts')
})
