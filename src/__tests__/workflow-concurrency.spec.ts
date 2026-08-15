/**
 * No workflow cancels its predecessor on a pull request from a fork.
 *
 * `cancel-in-progress` cancels whichever run is *already going* when another
 * one in the same group starts, so it stands for "the newer commit wins" only
 * while runs start in the order they were created. Runs from a fork wait for a
 * maintainer to approve them, and approval decides the start order instead — an
 * older commit approved a moment too late starts second and cancels the run for
 * the head. It happened on #62: two runs cancelled, checks restarted by hand.
 *
 * So on a pull request the flag has to be an expression that reads the head
 * repository, and `true` is the wrong answer however reasonable it looks in a
 * new workflow. That is what this fails on — by file name, before it is merged.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const WORKFLOWS = resolve(__dirname, '..', '..', '.github', 'workflows');

interface Workflow {
  readonly file: string;
  readonly source: string;
}

const workflows = (): Workflow[] =>
  readdirSync(WORKFLOWS)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => ({ file, source: readFileSync(join(WORKFLOWS, file), 'utf8') }));

/** `pull_request`, not `pull_request_target` — only the first waits for approval. */
const runsOnPullRequests = ({ source }: Workflow): boolean => /^ {2}pull_request:/m.test(source);

const cancelInProgress = ({ source }: Workflow): string | undefined =>
  /^ {2}cancel-in-progress: (.+)$/m.exec(source)?.[1]?.trim();

describe('workflow concurrency', () => {
  const all = workflows();
  const onPullRequests = all.filter(runsOnPullRequests);

  it('reads the workflows', () => {
    expect(all.length).toBeGreaterThan(3);
    expect(onPullRequests.length).toBeGreaterThan(0);
  });

  it.each(onPullRequests.map(({ file }) => file))(
    '%s does not cancel a run started before it on a fork',
    (file) => {
      const workflow = onPullRequests.find((candidate) => candidate.file === file) as Workflow;
      const flag = cancelInProgress(workflow);

      if (flag === undefined) return;

      expect(flag).not.toBe('true');
      expect(flag).toContain('github.event.pull_request.head.repo.full_name');
    },
  );
});
