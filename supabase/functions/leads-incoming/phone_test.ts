// Tests for normalizePhone. Runs with Deno (deno test) or Node 22+
// (node --experimental-strip-types --test phone_test.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from './phone.ts'

const MY_DIAL = '60'
const MY_TRUNK = '0'
const SG_DIAL = '65'
const SG_TRUNK = ''

test('MY local number with trunk prefix 0', () => {
  assert.equal(normalizePhone('012-345 6789', MY_DIAL, MY_TRUNK), '+60123456789')
})

test('MY number with leading +', () => {
  assert.equal(normalizePhone('+60 12-345 6789', MY_DIAL, MY_TRUNK), '+60123456789')
})

test('MY number with leading 00', () => {
  assert.equal(normalizePhone('0060 12-345 6789', MY_DIAL, MY_TRUNK), '+60123456789')
})

test('MY number whose local form starts with 60 keeps both digits', () => {
  // 06-0123456: the trunk 0 is dropped, then the country code 60 is added,
  // so the 60 that follows the trunk is part of the number, not a second country code
  assert.equal(normalizePhone('06-0123456', MY_DIAL, MY_TRUNK), '+6060123456')
})

test('SG local number with no trunk prefix', () => {
  assert.equal(normalizePhone('9123 4567', SG_DIAL, SG_TRUNK), '+6591234567')
})

test('too short after cleaning returns null', () => {
  assert.equal(normalizePhone('12-34', MY_DIAL, MY_TRUNK), null)
})
