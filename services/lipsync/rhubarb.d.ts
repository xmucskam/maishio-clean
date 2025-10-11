export interface MouthCue {
  start: number;
  end: number;
  value: string;
}

export function rhubarbCues(wavPath: string, outPath: string): Promise<void>;
