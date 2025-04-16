import axios from "axios";

class MicroClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || "";
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.timeout = options.timeout || 30000;
    this.locale = options.locale || "en-US";
    this.serviceApiKey = options.serviceApiKey || null;

    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: this.headers,
    });
  }

  setToken(token) {
    localStorage.setItem("token", token);
  }

  getToken() {
    return localStorage.getItem("token");
  }

  setLocale(locale) {
    this.locale = locale;
    return this;
  }

  async call(path, data = {}) {
    try {
      const response = await this.axios.post(`/api/${path}`, {
        data: {
          ...data,
          token: this.getToken(),
        },
        serviceApiKey: this.serviceApiKey,
        locale: this.locale,
      });
      const result = response.data;
      if (result.token) {
        this.setToken(result.token);
      }
      return result;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      }
      return {
        success: false,
        data: {
          code: "error",
          message: error.message,
        },
      };
    }
  }

  async uploadFile(path, files, data = {}) {
    try {
      const formData = new FormData();

      // Add files to FormData
      if (Array.isArray(files)) {
        files.forEach((file) => {
          formData.append("files", file);
        });
      } else {
        formData.append("files", files);
      }

      // Add additional data as JSON string
      formData.append(
        "data",
        JSON.stringify({
          ...data,
          token: this.getToken(),
        })
      );

      // Add required headers
      formData.append("serviceApiKey", this.serviceApiKey);
      formData.append("locale", this.locale);

      const response = await this.axios.post(`/api/${path}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const result = response.data;
      if (result.token) {
        this.setToken(result.token);
      }
      return result;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      }
      return {
        success: false,
        data: {
          code: "error",
          message: error.message,
        },
      };
    }
  }
}

export default MicroClient;
