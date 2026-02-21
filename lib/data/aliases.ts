import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { moduleAliases, providerAliases } from "@/db/schema";
import type { ModuleAlias, ProviderAlias } from "@/db/schema";
import { hasModule } from "@/lib/data/modules";
import { findAnyProvider } from "@/lib/data/providers";

type AliasConstraintCode =
  | "TARGET_NOT_FOUND"
  | "SOURCE_IS_ALIAS_TARGET"
  | "TARGET_IS_ALIAS"
  | "ALIAS_LOOP";

type AliasConstraintFailure = {
  ok: false;
  code: AliasConstraintCode;
  message: string;
};

type AliasConstraintSuccess = { ok: true };

export type AliasConstraintResult =
  | AliasConstraintSuccess
  | AliasConstraintFailure;

// ============================================================================
// Module Aliases
// ============================================================================

/**
 * Resolve a module alias to its target coordinates.
 * Returns the target (namespace, name, provider) or undefined if no alias exists.
 */
export async function resolveModuleAlias(
  sourceNamespace: string,
  sourceName: string,
  sourceProvider: string,
): Promise<{ namespace: string; name: string; provider: string } | undefined> {
  const db = getDb();
  const [alias] = await db
    .select({
      namespace: moduleAliases.targetNamespace,
      name: moduleAliases.targetName,
      provider: moduleAliases.targetProvider,
    })
    .from(moduleAliases)
    .where(
      and(
        eq(moduleAliases.sourceNamespace, sourceNamespace),
        eq(moduleAliases.sourceName, sourceName),
        eq(moduleAliases.sourceProvider, sourceProvider),
      ),
    )
    .limit(1);
  return alias;
}

/**
 * Find a module alias by source coordinates.
 * Returns the full alias record or undefined.
 */
export async function findModuleAlias(
  sourceNamespace: string,
  sourceName: string,
  sourceProvider: string,
): Promise<ModuleAlias | undefined> {
  const db = getDb();
  const [alias] = await db
    .select()
    .from(moduleAliases)
    .where(
      and(
        eq(moduleAliases.sourceNamespace, sourceNamespace),
        eq(moduleAliases.sourceName, sourceName),
        eq(moduleAliases.sourceProvider, sourceProvider),
      ),
    )
    .limit(1);
  return alias;
}

/**
 * Find a module alias by target coordinates.
 * Used to enforce no-chain/no-loop alias rules.
 */
export async function findModuleAliasByTarget(
  targetNamespace: string,
  targetName: string,
  targetProvider: string,
): Promise<ModuleAlias | undefined> {
  const db = getDb();
  const [alias] = await db
    .select()
    .from(moduleAliases)
    .where(
      and(
        eq(moduleAliases.targetNamespace, targetNamespace),
        eq(moduleAliases.targetName, targetName),
        eq(moduleAliases.targetProvider, targetProvider),
      ),
    )
    .limit(1);
  return alias;
}

/**
 * Resolve module coordinates to canonical coordinates.
 * Returns the original tuple when no alias exists.
 */
export async function resolveCanonicalModuleCoordinates(
  namespace: string,
  name: string,
  provider: string,
): Promise<{
  namespace: string;
  name: string;
  provider: string;
  aliased: boolean;
}> {
  const alias = await resolveModuleAlias(namespace, name, provider);
  if (!alias) {
    return { namespace, name, provider, aliased: false };
  }

  return {
    namespace: alias.namespace,
    name: alias.name,
    provider: alias.provider,
    aliased: true,
  };
}

/**
 * Shared alias-creation constraints for module aliases.
 * Reused by API routes and server actions so both enforce identical rules.
 */
export async function validateModuleAliasCreateConstraints(params: {
  sourceNamespace: string;
  sourceName: string;
  sourceProvider: string;
  targetNamespace: string;
  targetName: string;
  targetProvider: string;
}): Promise<AliasConstraintResult> {
  const targetExists = await hasModule(
    params.targetNamespace,
    params.targetName,
    params.targetProvider,
  );
  if (!targetExists) {
    return {
      ok: false,
      code: "TARGET_NOT_FOUND",
      message: "Alias target must be an existing canonical module",
    };
  }

  const sourceAsTarget = await findModuleAliasByTarget(
    params.sourceNamespace,
    params.sourceName,
    params.sourceProvider,
  );
  if (sourceAsTarget) {
    return {
      ok: false,
      code: "SOURCE_IS_ALIAS_TARGET",
      message:
        "Alias source cannot be an alias target (alias chains/loops are invalid)",
    };
  }

  const targetIsAlias = await findModuleAlias(
    params.targetNamespace,
    params.targetName,
    params.targetProvider,
  );
  if (targetIsAlias) {
    return {
      ok: false,
      code: "TARGET_IS_ALIAS",
      message: "Alias target must be canonical (alias-to-alias is invalid)",
    };
  }

  const directLoop = await resolveModuleAlias(
    params.targetNamespace,
    params.targetName,
    params.targetProvider,
  );
  if (
    directLoop &&
    directLoop.namespace === params.sourceNamespace &&
    directLoop.name === params.sourceName &&
    directLoop.provider === params.sourceProvider
  ) {
    return { ok: false, code: "ALIAS_LOOP", message: "Alias loop detected" };
  }

  return { ok: true };
}

/**
 * Create a new module alias.
 * Throws on unique constraint violation (source already aliased).
 */
export async function createModuleAlias(params: {
  sourceNamespace: string;
  sourceName: string;
  sourceProvider: string;
  targetNamespace: string;
  targetName: string;
  targetProvider: string;
  createdBy?: string;
}): Promise<ModuleAlias> {
  const db = getDb();
  const [alias] = await db
    .insert(moduleAliases)
    .values({
      sourceNamespace: params.sourceNamespace,
      sourceName: params.sourceName,
      sourceProvider: params.sourceProvider,
      targetNamespace: params.targetNamespace,
      targetName: params.targetName,
      targetProvider: params.targetProvider,
      createdBy: params.createdBy,
    })
    .returning();
  return alias!;
}

/**
 * Delete a module alias by source coordinates.
 * Returns the deleted alias or undefined if not found.
 */
export async function deleteModuleAlias(
  sourceNamespace: string,
  sourceName: string,
  sourceProvider: string,
): Promise<ModuleAlias | undefined> {
  const db = getDb();
  const [deleted] = await db
    .delete(moduleAliases)
    .where(
      and(
        eq(moduleAliases.sourceNamespace, sourceNamespace),
        eq(moduleAliases.sourceName, sourceName),
        eq(moduleAliases.sourceProvider, sourceProvider),
      ),
    )
    .returning();
  return deleted;
}

/**
 * Delete all module aliases that target the given canonical coordinates.
 */
export async function deleteModuleAliasesByTarget(
  targetNamespace: string,
  targetName: string,
  targetProvider: string,
): Promise<ModuleAlias[]> {
  const db = getDb();
  return db
    .delete(moduleAliases)
    .where(
      and(
        eq(moduleAliases.targetNamespace, targetNamespace),
        eq(moduleAliases.targetName, targetName),
        eq(moduleAliases.targetProvider, targetProvider),
      ),
    )
    .returning();
}

// ============================================================================
// Provider Aliases
// ============================================================================

/**
 * Resolve a provider alias to its target coordinates.
 * Returns the target (namespace, type) or undefined if no alias exists.
 */
export async function resolveProviderAlias(
  sourceNamespace: string,
  sourceType: string,
): Promise<{ namespace: string; type: string } | undefined> {
  const db = getDb();
  const [alias] = await db
    .select({
      namespace: providerAliases.targetNamespace,
      type: providerAliases.targetType,
    })
    .from(providerAliases)
    .where(
      and(
        eq(providerAliases.sourceNamespace, sourceNamespace),
        eq(providerAliases.sourceType, sourceType),
      ),
    )
    .limit(1);
  return alias;
}

/**
 * Find a provider alias by source coordinates.
 * Returns the full alias record or undefined.
 */
export async function findProviderAlias(
  sourceNamespace: string,
  sourceType: string,
): Promise<ProviderAlias | undefined> {
  const db = getDb();
  const [alias] = await db
    .select()
    .from(providerAliases)
    .where(
      and(
        eq(providerAliases.sourceNamespace, sourceNamespace),
        eq(providerAliases.sourceType, sourceType),
      ),
    )
    .limit(1);
  return alias;
}

/**
 * Find a provider alias by target coordinates.
 * Used to enforce no-chain/no-loop alias rules.
 */
export async function findProviderAliasByTarget(
  targetNamespace: string,
  targetType: string,
): Promise<ProviderAlias | undefined> {
  const db = getDb();
  const [alias] = await db
    .select()
    .from(providerAliases)
    .where(
      and(
        eq(providerAliases.targetNamespace, targetNamespace),
        eq(providerAliases.targetType, targetType),
      ),
    )
    .limit(1);
  return alias;
}

/**
 * Resolve provider coordinates to canonical target if an alias exists.
 */
export async function resolveProviderCoordinates(
  namespace: string,
  type: string,
): Promise<{ namespace: string; type: string; aliased: boolean }> {
  const alias = await resolveProviderAlias(namespace, type);
  if (!alias) {
    return { namespace, type, aliased: false };
  }

  return { namespace: alias.namespace, type: alias.type, aliased: true };
}

/**
 * Shared alias-creation constraints for provider aliases.
 * Reused by API routes and server actions so both enforce identical rules.
 */
export async function validateProviderAliasCreateConstraints(params: {
  sourceNamespace: string;
  sourceType: string;
  targetNamespace: string;
  targetType: string;
}): Promise<AliasConstraintResult> {
  const targetExists = await findAnyProvider(
    params.targetNamespace,
    params.targetType,
  );
  if (!targetExists) {
    return {
      ok: false,
      code: "TARGET_NOT_FOUND",
      message: `Provider target ${params.targetNamespace}/${params.targetType} not found for alias`,
    };
  }

  const [sourceAsTarget, targetAsSource] = await Promise.all([
    findProviderAliasByTarget(params.sourceNamespace, params.sourceType),
    findProviderAlias(params.targetNamespace, params.targetType),
  ]);

  if (sourceAsTarget) {
    return {
      ok: false,
      code: "SOURCE_IS_ALIAS_TARGET",
      message:
        "Alias source cannot be an alias target (alias chains/loops are not allowed)",
    };
  }

  if (targetAsSource) {
    return {
      ok: false,
      code: "TARGET_IS_ALIAS",
      message: "Alias target must be canonical (alias-to-alias is not allowed)",
    };
  }

  const directLoop = await resolveProviderAlias(
    params.targetNamespace,
    params.targetType,
  );
  if (
    directLoop &&
    directLoop.namespace === params.sourceNamespace &&
    directLoop.type === params.sourceType
  ) {
    return { ok: false, code: "ALIAS_LOOP", message: "Alias loop detected" };
  }

  return { ok: true };
}

/**
 * Create a new provider alias.
 * Throws on unique constraint violation (source already aliased).
 */
export async function createProviderAlias(params: {
  sourceNamespace: string;
  sourceType: string;
  targetNamespace: string;
  targetType: string;
  createdBy?: string;
}): Promise<ProviderAlias> {
  const db = getDb();
  const [alias] = await db
    .insert(providerAliases)
    .values({
      sourceNamespace: params.sourceNamespace,
      sourceType: params.sourceType,
      targetNamespace: params.targetNamespace,
      targetType: params.targetType,
      createdBy: params.createdBy,
    })
    .returning();
  return alias!;
}

/**
 * Delete a provider alias by source coordinates.
 * Returns the deleted alias or undefined if not found.
 */
export async function deleteProviderAlias(
  sourceNamespace: string,
  sourceType: string,
): Promise<ProviderAlias | undefined> {
  const db = getDb();
  const [deleted] = await db
    .delete(providerAliases)
    .where(
      and(
        eq(providerAliases.sourceNamespace, sourceNamespace),
        eq(providerAliases.sourceType, sourceType),
      ),
    )
    .returning();
  return deleted;
}

/**
 * Delete all provider aliases that target the given canonical coordinates.
 */
export async function deleteProviderAliasesByTarget(
  targetNamespace: string,
  targetType: string,
): Promise<ProviderAlias[]> {
  const db = getDb();
  return db
    .delete(providerAliases)
    .where(
      and(
        eq(providerAliases.targetNamespace, targetNamespace),
        eq(providerAliases.targetType, targetType),
      ),
    )
    .returning();
}
