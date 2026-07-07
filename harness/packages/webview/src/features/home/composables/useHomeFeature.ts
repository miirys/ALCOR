import { ref, reactive } from 'vue';

export interface AppInfo {
  title: string;
  description: string;
  version: string;
}

export function useHomeFeature() {
  const appInfo = reactive<AppInfo>({
    title: 'GitLab Language Server Webview',
    description: 'Unified webview for IDE-native experiences',
    version: '0.0.0',
  });

  const isLoading = ref(false);

  const handleButtonClick = () => {
    console.log('Get Started clicked');
    // Future: Navigate to a specific feature or open a dialog
  };

  return {
    appInfo,
    isLoading,
    handleButtonClick,
  };
}
