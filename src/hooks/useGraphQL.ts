export * from './graphql/types';
export * from './graphql/useBaseGraphQL';
export * from './graphql/useGameOperations';
export * from './graphql/useMarketOperations';
export * from './graphql/useReferralOperations';
export * from './graphql/useUpgradeOperations';
export * from './graphql/useUserOperations';

import { useBaseGraphQL, useBaseMutation } from './graphql/useBaseGraphQL';

// Re-export the main hooks as named exports to maintain backward compatibility if needed, 
// though `export *` handles most cases. 
// We explicitly export `useGraphQL` and `useGraphQLMutation` alias if the original file had them as default or specific named exports that conflict.

// The original file exported `useGraphQL` and `useGraphQLMutation`.
export const useGraphQL = useBaseGraphQL;
export const useGraphQLMutation = useBaseMutation;
