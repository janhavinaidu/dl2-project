import React from 'react';

export type EdgeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const SafeAreaProvider = ({
  children,
}: {
  children?: React.ReactNode;
}) => React.createElement(React.Fragment, null, children);

export const SafeAreaConsumer = ({ children }: any) =>
  children(ZERO_INSETS);

export const SafeAreaView = ({ children, style, ...rest }: any) =>
  React.createElement('div', { style, ...rest }, children);

export const useSafeAreaInsets = (): EdgeInsets => ZERO_INSETS;

export const useSafeAreaFrame = (): Rect => ({
  x: 0,
  y: 0,
  width: typeof window !== 'undefined' ? window.innerWidth : 0,
  height: typeof window !== 'undefined' ? window.innerHeight : 0,
});

export const initialWindowMetrics = {
  insets: ZERO_INSETS,
  frame: { x: 0, y: 0, width: 0, height: 0 },
};
