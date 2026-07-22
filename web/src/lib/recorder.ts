// Minimal voice capture: request the mic, record to a webm Blob. Used for voice
// notes and voice reflections; the blob is uploaded to the audio-recordings
// bucket and transcribed by the transcribe-audio edge function.
export class Recorder {
  private media: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.media = new MediaRecorder(this.stream);
    this.media.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.media.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.media) return resolve(new Blob());
      this.media.onstop = () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.media = null;
        resolve(blob);
      };
      this.media.stop();
    });
  }

  get recording(): boolean {
    return this.media?.state === "recording";
  }
}

export const micSupported = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== "undefined";
