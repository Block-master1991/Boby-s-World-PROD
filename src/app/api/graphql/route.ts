/**
 * Professional GraphQL API Route
 * Powered by GraphQL Yoga
 */

import { buildContext } from '@/graphql/context';
import { schema } from '@/graphql/schema/index';
import { permissions } from '@/graphql/schema/permissions';
import { logger } from '@/utils/logger';
import type { DocumentNode, OperationDefinitionNode, SelectionNode } from 'graphql';
import { applyMiddleware } from 'graphql-middleware';
import { createGraphQLError, createYoga } from 'graphql-yoga';

// Apply Shield Permissions Middleware
const schemaWithPermissions = applyMiddleware(schema, permissions);

// Initialize GraphQL Yoga
const yoga = createYoga({
  schema: schemaWithPermissions,
  graphqlEndpoint: '/api/graphql',
  context: buildContext,
  // Ensure Next.js compatible runtime
  fetchAPI: { Request, Response },
  maskedErrors: {
    maskError(error: unknown) {
      if (error instanceof Error) {
        const err = error as Error & { extensions?: Record<string, unknown>; name?: string };
        const isPublicError = err.extensions?.['http'] || err.name === 'GraphQLError' || err.message === 'Access Denied';
        if (isPublicError) return err;
      }
      
      logger.error('[GraphQL Internal Error]:', error);
      return createGraphQLError('Internal Server Error', {
        extensions: { code: 'INTERNAL_SERVER_ERROR' }
      });
    }
  },
  plugins: [
    // Performance Logging Plugin
    {
      onExecute() {
        const start = Date.now();
        return {
          onEnd({ args }: { args: { document: DocumentNode } }) {
            const duration = Date.now() - start;
            const operation = args.document.definitions[0] as OperationDefinitionNode;
            const operationName = operation.name?.value || 'anonymous';
            
            if (duration > 500) {
              logger.warn(`[GraphQL Performance] Slow operation detected: ${operationName} (${duration}ms)`);
            } else {
              logger.debug(`[GraphQL Performance] ${operationName} took ${duration}ms`);
            }
          }
        };
      }
    },
    // Simple Query Complexity Limiter (Custom Plugin)
    {
      onExecute({ args }: { args: { document: DocumentNode } }) {
        const depth = (document: DocumentNode): number => {
          let max_depth = 0;
          const visit = (node: SelectionNode | OperationDefinitionNode, current: number) => {
            if ('selectionSet' in node && node.selectionSet) {
              node.selectionSet.selections.forEach((s) => visit(s, current + 1));
            } else {
              max_depth = Math.max(max_depth, current);
            }
          };
          
          const operation = document.definitions[0] as OperationDefinitionNode;
          visit(operation, 0);
          return max_depth;
        };
        
        const queryDepth = depth(args.document);
        if (queryDepth > 7) {
          throw new Error('Query is too complex. Maximum depth is 7.');
        }
      }
    }
  ]
});

// Export Next.js Route Handlers
export const GET = (request: Request) => yoga.handle(request);
export const POST = (request: Request) => yoga.handle(request);
