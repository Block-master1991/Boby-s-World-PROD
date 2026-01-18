import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: 'http://localhost:3000/api/graphql',
  documents: 'src/**/*.graphql',
  generates: {
    'src/graphql/generated/types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '@/graphql/context#GraphQLContext',
        useIndexSignature: true,
      },
    },
    'src/graphql/generated/hooks.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-urql'],
      config: {
        withHooks: true,
      },
    },
  },
};

export default config;
