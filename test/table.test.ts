import { describe, expect, it } from 'vitest';
import { renderTable } from '../src/util/table.js';

describe('renderTable', () => {
  it('renders a psql-style table with right-aligned numbers', () => {
    const table = renderTable(
      ['Url', 'SuccessTimes', 'FailedTimes'],
      [
        ['http://sci-hub.ru', '10', '0'],
        ['http://sci-hub.se', '1', '3'],
      ],
    );
    expect(table.split('\n')).toEqual([
      '+-------------------+--------------+-------------+',
      '| Url               | SuccessTimes | FailedTimes |',
      '|-------------------+--------------+-------------|',
      '| http://sci-hub.ru |           10 |           0 |',
      '| http://sci-hub.se |            1 |           3 |',
      '+-------------------+--------------+-------------+',
    ]);
  });

  it('renders headers alone when there are no rows', () => {
    expect(renderTable(['A', 'B'], []).split('\n')).toHaveLength(4);
  });
});
