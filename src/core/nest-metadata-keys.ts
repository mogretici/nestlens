/**
 * The keys Nest writes its decorator metadata under, for the ones NestLens
 * reads or writes itself.
 *
 * Inlined rather than imported from `@nestjs/common/constants`, which is not
 * part of the package's public API (the same reasoning as `HTTP_CODE_METADATA`
 * in the response interceptor and the keys in the tool manifest). Identical in
 * NestJS 9, 10, 11 and 12; `nest-metadata-keys.spec.ts` asserts each still
 * matches, so a rename fails a test rather than a mount point or a status.
 */

/** A controller's route prefix, written by `@Controller()`. */
export const PATH_METADATA_KEY = 'path';

/** A controller's version, written by `@Controller({ version })` and `@Version()`. */
export const VERSION_METADATA_KEY = '__version__';

/** The exception types a filter handles, written by `@Catch()`. */
export const FILTER_CATCH_EXCEPTIONS_KEY = '__filterCatchExceptions__';
