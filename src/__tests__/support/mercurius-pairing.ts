/**
 * Whether the Mercurius that is installed can run on the Fastify that is.
 *
 * Mercurius has needed Fastify 5 since its 15.0.0, and `@nestjs/platform-fastify`
 * decides which Fastify is present: NestJS 9 and 10 bring Fastify 4. The
 * compatibility matrix pins a Mercurius to match, but a pairing it cannot fix —
 * a local `npm install` after a NestJS downgrade, a resolution that lands
 * somewhere unexpected — used to surface as nine failing suites reporting
 * `expected '5.x' fastify version, '4.28.1' is installed`, which says nothing
 * about NestLens.
 *
 * A suite that cannot run says so and skips. What it covers is covered wherever
 * the two do line up, which is every ordinary checkout and the unit-test job.
 */
const majorOf = (name: string): number | undefined => {
  try {
    const { version } = require(`${name}/package.json`) as { version: string };

    return Number(version.split('.')[0]);
  } catch {
    return undefined;
  }
};

const fastifyMajor = majorOf('fastify');
const mercuriusMajor = majorOf('mercurius');

export const mercuriusRunsHere =
  fastifyMajor !== undefined &&
  mercuriusMajor !== undefined &&
  // 15 and above want Fastify 5; everything before it wants Fastify 4.
  (mercuriusMajor >= 15 ? fastifyMajor >= 5 : fastifyMajor < 5);

/** `describe` where the pair works, and a skip with the reason where it does not. */
export const describeMercurius = mercuriusRunsHere ? describe : describe.skip;
