import { describe, expect, it } from 'vitest';
import {
  effectiveMandals,
  geoAudienceRpcArgs,
  targetsEveryone,
} from './geo-audience';

describe('effectiveMandals', () => {
  it('keeps mandals under exactly one district', () => {
    expect(effectiveMandals(['Eluru'], ['Bhimadole'])).toEqual(['Bhimadole']);
  });

  // The reported bug: Unclassified + Eluru + Krishna showed 8 recipients
  // instead of 202, because a mandal left over from an earlier
  // single-district selection was still AND-ed into the query.
  it('drops stale mandals when several districts are selected', () => {
    expect(
      effectiveMandals(['Unclassified', 'Eluru', 'Krishna'], ['Bhimadole']),
    ).toEqual([]);
  });

  it('drops mandals when no district is selected', () => {
    expect(effectiveMandals([], ['Bhimadole'])).toEqual([]);
  });
});

describe('geoAudienceRpcArgs', () => {
  it('always sends tag ids — step 4 used to omit them', () => {
    const args = geoAudienceRpcArgs('acct', { districts: ['Eluru'], tagIds: ['t1'] }, 1);
    expect(args.p_tag_ids).toEqual(['t1']);
    expect(args.p_limit).toBe(1);
  });

  it('produces identical filters for the count and the send', () => {
    const audience = {
      districts: ['Unclassified', 'Eluru', 'Krishna'],
      mandals: ['Bhimadole'],
      tagIds: ['t1'],
      excludeTagIds: ['t2'],
    };
    const count = geoAudienceRpcArgs('acct', audience, 1);
    const send = geoAudienceRpcArgs('acct', audience, null);
    const { p_limit: _a, ...countFilters } = count;
    const { p_limit: _b, ...sendFilters } = send;
    expect(countFilters).toEqual(sendFilters);
    expect(sendFilters.p_mandals).toEqual([]);
  });

  it('defaults every array so an undefined field never means "no filter"', () => {
    const args = geoAudienceRpcArgs('acct', {}, null);
    expect(args).toEqual({
      p_account_id: 'acct',
      p_districts: [],
      p_mandals: [],
      p_tag_ids: [],
      p_exclude_tag_ids: [],
      p_limit: null,
    });
  });
});

describe('targetsEveryone', () => {
  it('flags an empty geo audience as the whole database', () => {
    expect(targetsEveryone({})).toBe(true);
    expect(targetsEveryone({ districts: [], mandals: ['x'] })).toBe(true);
  });

  it('is false once any real narrowing exists', () => {
    expect(targetsEveryone({ districts: ['Eluru'] })).toBe(false);
    expect(targetsEveryone({ tagIds: ['t1'] })).toBe(false);
    expect(targetsEveryone({ excludeTagIds: ['t2'] })).toBe(false);
  });
});

describe('geoAudienceRpcArgs — always-exclude tags', () => {
  // Numbers Meta rejected as non-WhatsApp (#131026) must be dropped from
  // every send, and from the counts too — otherwise the approved number
  // is bigger than what actually goes out.
  it('folds the not-on-whatsapp tag into the exclude list', () => {
    const args = geoAudienceRpcArgs('acct', { districts: ['Eluru'] }, 1, ['wa-bad']);
    expect(args.p_exclude_tag_ids).toEqual(['wa-bad']);
  });

  it('merges it with the user-chosen excludes without duplicating', () => {
    const args = geoAudienceRpcArgs(
      'acct',
      { districts: ['Eluru'], excludeTagIds: ['opted-out', 'wa-bad'] },
      1,
      ['wa-bad'],
    );
    expect(args.p_exclude_tag_ids.sort()).toEqual(['opted-out', 'wa-bad']);
  });

  it('ignores a null tag id rather than sending garbage', () => {
    const args = geoAudienceRpcArgs('acct', { districts: ['Eluru'] }, 1, [null, undefined]);
    expect(args.p_exclude_tag_ids).toEqual([]);
  });

  it('keeps the count and the send excluding the same tags', () => {
    const a = { districts: ['Eluru'], excludeTagIds: ['x'] };
    expect(geoAudienceRpcArgs('acct', a, 1, ['wa']).p_exclude_tag_ids).toEqual(
      geoAudienceRpcArgs('acct', a, null, ['wa']).p_exclude_tag_ids,
    );
  });
});
