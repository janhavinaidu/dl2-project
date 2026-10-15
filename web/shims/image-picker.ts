export type Asset = {
  uri?: string;
  fileName?: string;
  type?: string;
  width?: number;
  height?: number;
  file?: File;
};

export type ImagePickerResponse = {
  assets?: Asset[];
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type ImageLibraryOptions = {
  mediaType?: 'photo' | 'video' | 'mixed';
  [key: string]: unknown;
};

export type CameraOptions = ImageLibraryOptions;

function openFileDialog(capture: boolean): Promise<ImagePickerResponse> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) {
      input.setAttribute('capture', 'environment');
    }
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve({ didCancel: true });
        return;
      }
      resolve({
        assets: [
          {
            uri: URL.createObjectURL(file),
            fileName: file.name,
            type: file.type || 'image/jpeg',
            file,
          },
        ],
      });
    };
    document.body.appendChild(input);
    input.click();
  });
}

export const launchImageLibrary = (
  _options?: ImageLibraryOptions,
): Promise<ImagePickerResponse> => openFileDialog(false);

export const launchCamera = (
  _options?: CameraOptions,
): Promise<ImagePickerResponse> => openFileDialog(true);
