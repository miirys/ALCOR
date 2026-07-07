import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const isInitialized = ref(true);

  return {
    isInitialized,
  };
});
