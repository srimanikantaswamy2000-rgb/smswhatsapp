/**
 * One place that decides what a geo audience actually means.
 *
 * Step 2's count, step 4's count, and the send path each built their own
 * argument list for `resolve_broadcast_audience`, and they disagreed:
 *
 *  - Mandals only make sense under exactly ONE district (they are
 *    district-scoped names). With several districts selected, a leftover
 *    mandal from an earlier single-district selection was still sent and
 *    AND-ed in, so picking Unclassified + Eluru + Krishna reported 8
 *    recipients instead of 202.
 *  - Step 4 omitted `p_tag_ids` entirely, so an include-tag narrowing
 *    applied in step 2 and at send time silently vanished from the
 *    number the user actually approved.
 *
 * Every caller must go through `geoAudienceRpcArgs` so the count the
 * user approves is the count that gets messaged.
 */

export interface GeoAudienceInput {
  districts?: string[];
  mandals?: string[];
  tagIds?: string[];
  excludeTagIds?: string[];
}

/**
 * Mandals are district-scoped, so they are only meaningful when exactly
 * one district is selected. Anything else drops them rather than
 * silently intersecting them with unrelated districts.
 */
export function effectiveMandals(
  districts: string[],
  mandals: string[],
): string[] {
  return districts.length === 1 ? mandals : [];
}

/** True when this geo audience targets every contact in the account. */
export function targetsEveryone(input: GeoAudienceInput): boolean {
  return (
    (input.districts ?? []).length === 0 &&
    (input.tagIds ?? []).length === 0 &&
    (input.excludeTagIds ?? []).length === 0
  );
}

/**
 * Build the `resolve_broadcast_audience` arguments. `limit` is null for
 * the full fetch (the send) and 1 when only `total_count` is needed.
 */
export function geoAudienceRpcArgs(
  accountId: string,
  input: GeoAudienceInput,
  limit: number | null,
) {
  const districts = input.districts ?? [];
  return {
    p_account_id: accountId,
    p_districts: districts,
    p_mandals: effectiveMandals(districts, input.mandals ?? []),
    p_tag_ids: input.tagIds ?? [],
    p_exclude_tag_ids: input.excludeTagIds ?? [],
    p_limit: limit,
  };
}
