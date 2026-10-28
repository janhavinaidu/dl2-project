import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import SpeciesInfoCard from '../src/SpeciesInfoCard';
import type { Theme } from '../src/types';

const theme: Theme = {
  bg: '#ffffff',
  text: '#111111',
  muted: '#666666',
  card: '#eeeeee',
  track: '#dddddd',
  accent: '#0088aa',
};

function allText(tree: ReactTestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join(' ');
}

test('shows the summary and fun fact', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SpeciesInfoCard
        label="ABBOTTS BABBLER"
        info={{ summary: 'A secretive babbler.', fun_fact: 'It sings duets.' }}
        loading={false}
        error={null}
        onRetry={() => {}}
        theme={theme}
      />,
    );
  });

  const text = allText(tree as ReactTestRenderer.ReactTestRenderer);
  expect(text).toContain('A secretive babbler.');
  expect(text).toContain('It sings duets.');
});

test('shows an error and retries', async () => {
  const onRetry = jest.fn();
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SpeciesInfoCard
        label="ABBOTTS BABBLER"
        info={null}
        loading={false}
        error="Groq unavailable"
        onRetry={onRetry}
        theme={theme}
      />,
    );
  });

  const rendered = tree as ReactTestRenderer.ReactTestRenderer;
  expect(allText(rendered)).toContain('Groq unavailable');
  const retry = rendered.root.findAllByProps({ testID: 'species-retry' })[0];
  await ReactTestRenderer.act(() => {
    retry.props.onPress();
  });
  expect(onRetry).toHaveBeenCalled();
});
