import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWealthHistogram} from '../lib/simulation/histogram.ts';
import {createWorld,stepWorld,assertWorld,wealth} from '../lib/simulation/engine.ts';

void test('the exact month-49 negative residue belongs to the zero bin', () => {
  const values = [-2.220446049250313e-16, 0, 100];
  const {bins,invalidCount} = buildWealthHistogram(values);
  assert.equal(invalidCount, 0);
  assert.equal(bins[0].count, 2);
  assert.equal(bins[15].count, 1);
  assert.equal(bins.reduce((total,bin)=>total+bin.count,0), values.length);
});

void test('empty, zero-only, identical and extreme finite wealth remain countable', () => {
  for (const values of [[],[0,-0,0],[100,100,100],[Number.MIN_VALUE,1,Number.MAX_VALUE]]) {
    const {bins,invalidCount} = buildWealthHistogram(values);
    assert.equal(invalidCount,0);
    assert.equal(bins.length,16);
    assert.equal(bins.reduce((n,b)=>n+b.count,0),values.length);
    assert.ok(bins.every(b=>Number.isFinite(b.lower)&&Number.isFinite(b.upper)&&b.count>=0));
  }
});

void test('genuinely invalid values are reported rather than hidden as zero wealth', () => {
  const {bins,invalidCount} = buildWealthHistogram([NaN,Infinity,-Infinity,-1,0,50]);
  assert.equal(invalidCount,4);
  assert.equal(bins.reduce((n,b)=>n+b.count,0),2);
});

void test('monthly charts retain all 2000 people and payments never overdraw cash', () => {
  const w=createWorld();
  for(let i=0;i<120;i++){
    stepWorld(w);
    assertWorld(w);
    assert.ok(w.people.every(p=>p.cash>=0),`negative cash at month ${w.month}`);
    const {bins,invalidCount}=buildWealthHistogram(w.people.map(p=>wealth(p,w)));
    assert.equal(invalidCount,0);
    assert.equal(bins.reduce((n,b)=>n+b.count,0),w.people.length);
  }
});
