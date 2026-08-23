/**
 * The two places the dashboard writes HTML it did not build.
 *
 * Everything else React escapes for us. `SqlViewer` and `MailDetailView` use
 * `dangerouslySetInnerHTML`, and both are handed text that came out of the
 * watched application — a query with a string literal in it, an email body —
 * which is where a value a stranger typed can end up. Nothing covered either.
 *
 * Both are correct today: the SQL highlighter escapes before it inserts its
 * own markup, and the mail view runs the body through DOMPurify. That is
 * exactly why it is worth a test — these are the two spots where a later
 * change is most expensive, and the failure would be silent.
 */
import { render, screen } from '@testing-library/react';
import SqlViewer from '../../components/SqlViewer';

/** Every element the container holds, by tag name. */
const tagsIn = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('*')].map((element) => element.tagName.toLowerCase());

describe('SqlViewer, given a query holding markup', () => {
  it.each([
    ['a script tag', "SELECT * FROM users WHERE name = '<script>alert(1)</script>'"],
    ['an image with a handler', "SELECT * FROM t WHERE a = '<img src=x onerror=alert(1)>'"],
    ['an iframe', "SELECT * FROM t WHERE a = '<iframe src=\"javascript:alert(1)\"></iframe>'"],
    ['a broken attribute', 'SELECT * FROM t WHERE a = \'" onmouseover="alert(1)\''],
    ['a closing span of its own', "SELECT * FROM t WHERE a = '</span><b>x</b>'"],
  ])('renders no element of its own: %s', (_name, query) => {
    const { container } = render(<SqlViewer query={query} />);

    const foreign = tagsIn(container).filter(
      (tag) => !['div', 'span', 'pre', 'h2', 'button', 'svg', 'path', 'rect', 'line', 'polyline', 'circle'].includes(tag),
    );

    expect(foreign).toEqual([]);
  });

  it('shows the markup as text rather than dropping it', () => {
    // Escaped, not removed: a reader debugging a query needs to see what it
    // actually said.
    render(<SqlViewer query="SELECT * FROM t WHERE a = '<script>x</script>'" />);

    expect(screen.getByText(/<script>x<\/script>/)).toBeInTheDocument();
  });

  it('still highlights an ordinary query', () => {
    const { container } = render(<SqlViewer query="SELECT id FROM users" />);

    expect(container.querySelectorAll('.sql-keyword').length).toBeGreaterThan(0);
  });

  it('escapes an ampersand once, not twice', () => {
    // `&` is escaped to `&amp;` before the markup goes in; rendering it back
    // has to give the character the query held, not the entity.
    const { container } = render(<SqlViewer query="SELECT * FROM t WHERE a = 'a & b'" />);

    expect(container.textContent).toContain('a & b');
    expect(container.textContent).not.toContain('&amp;');
  });
});
