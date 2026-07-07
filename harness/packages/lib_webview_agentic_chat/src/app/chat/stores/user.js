import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    isAuthenticated: true, // Assume authenticated until proven otherwise
  }),

  getters: {
    userAvatarUrl: (state) => state.user?.avatarUrl || null,
    userName: (state) => state.user?.name || state.user?.username || 'Unknown User',
  },

  actions: {
    getUserInfo() {
      this.sendNotification('getUserInfo');
    },

    setUserInfo(userData) {
      this.user = userData;
    },

    setAuthenticationStatus(isAuthenticated) {
      this.isAuthenticated = isAuthenticated;
    },
  },

  events: {
    setUserInfo: 'setUserInfo',
    setAuthenticationStatus: 'setAuthenticationStatus',
  },
});
