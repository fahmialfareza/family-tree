"use client";

import { AppProgressBar as ProgressBar } from "next-nprogress-bar";

const ProgressBarProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <ProgressBar
        height="4px"
        color="#fffd00"
        options={{ showSpinner: true }}
        shallowRouting
      />
      {children}
    </>
  );
};

export default ProgressBarProvider;
