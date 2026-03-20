class WatermarkManager {
  constructor() {
    this.watermarkStrength = 0.01; // Very subtle watermark
    this.init();
  }

  init() {
    console.log('Watermark system initialized');
  }

  embedWatermark(canvas, userId) {
    if (!canvas || !userId) {
      console.error('Canvas or userId not provided');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    try {
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert userId to binary
      const binary = this.stringToBinary(userId);
      
      // Embed binary data in the least significant bits of the red channel
      for (let i = 0; i < binary.length && i < data.length / 4; i++) {
        const pixelIndex = i * 4; // Red channel index
        const bit = parseInt(binary[i]);
        
        // Modify the least significant bit of the red channel
        data[pixelIndex] = (data[pixelIndex] & 0xFE) | bit;
      }

      // Add a marker at the end to indicate watermark presence
      const markerIndex = Math.min(binary.length, Math.floor(data.length / 4) - 1);
      if (markerIndex > 0) {
        data[markerIndex * 4] |= 1; // Set last bit to 1
      }

      // Put the modified image data back
      ctx.putImageData(imageData, 0, 0);

      console.log(`Watermark embedded for user: ${userId}`);
    } catch (error) {
      console.error('Error embedding watermark:', error);
    }
  }

  extractWatermark(canvas, expectedUserId = null) {
    if (!canvas) {
      console.error('Canvas not provided');
      return null;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return null;
    }

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Extract binary from least significant bits of red channel
      let binary = '';
      let foundMarker = false;

      for (let i = 0; i < data.length / 4; i++) {
        const pixelIndex = i * 4;
        const bit = data[pixelIndex] & 1;
        binary += bit;

        // Check for marker (end of watermark)
        if (i > 10 && bit === 1) {
          // Look ahead to see if this is the end marker
          let consecutiveOnes = 0;
          for (let j = i; j < Math.min(i + 5, data.length / 4); j++) {
            if ((data[j * 4] & 1) === 1) {
              consecutiveOnes++;
            } else {
              break;
            }
          }
          
          if (consecutiveOnes >= 3) {
            foundMarker = true;
            binary = binary.substring(0, i);
            break;
          }
        }
      }

      if (!foundMarker && binary.length > 0) {
        // Remove trailing zeros
        binary = binary.replace(/0+$/, '');
      }

      // Convert binary to string
      const extractedUserId = this.binaryToString(binary);

      if (expectedUserId && extractedUserId !== expectedUserId) {
        console.warn(`Watermark mismatch: expected ${expectedUserId}, found ${extractedUserId}`);
      }

      return extractedUserId;
    } catch (error) {
      console.error('Error extracting watermark:', error);
      return null;
    }
  }

  verifyWatermark(canvas, expectedUserId) {
    const extractedUserId = this.extractWatermark(canvas, expectedUserId);
    return extractedUserId === expectedUserId;
  }

  embedInvisibleText(canvas, text) {
    if (!canvas || !text) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Save current context state
      ctx.save();

      // Set very low opacity for invisible text
      ctx.globalAlpha = 0.01;
      ctx.font = '1px Arial';
      ctx.fillStyle = '#000000';

      // Create a pattern of invisible text
      const textLength = text.length;
      const step = Math.max(50, Math.floor(canvas.width / textLength));

      for (let x = 0; x < canvas.width; x += step * 2) {
        for (let y = 0; y < canvas.height; y += 20) {
          const charIndex = Math.floor((x / step + y / 20) % textLength);
          ctx.fillText(text[charIndex], x, y);
        }
      }

      // Restore context state
      ctx.restore();

      console.log(`Invisible text watermark embedded: ${text}`);
    } catch (error) {
      console.error('Error embedding invisible text:', error);
    }
  }

  embedMetadata(canvas, metadata) {
    if (!canvas || !metadata) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Convert metadata to JSON string
      const metadataString = JSON.stringify(metadata);
      const binary = this.stringToBinary(metadataString);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Use green channel for metadata to avoid conflicts with user ID watermark
      for (let i = 0; i < binary.length && i < data.length / 4; i++) {
        const pixelIndex = i * 4 + 1; // Green channel index
        const bit = parseInt(binary[i]);
        data[pixelIndex] = (data[pixelIndex] & 0xFE) | bit;
      }

      ctx.putImageData(imageData, 0, 0);
      console.log('Metadata watermark embedded');
    } catch (error) {
      console.error('Error embedding metadata:', error);
    }
  }

  extractMetadata(canvas) {
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let binary = '';
      for (let i = 0; i < data.length / 4; i++) {
        const pixelIndex = i * 4 + 1; // Green channel
        const bit = data[pixelIndex] & 1;
        binary += bit;
      }

      // Clean up binary string
      binary = binary.replace(/0+$/, '');
      
      const metadataString = this.binaryToString(binary);
      return JSON.parse(metadataString);
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return null;
    }
  }

  createTrackingPixel(userId, uploadId) {
    // Create a 1x1 tracking pixel with encoded information
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    // Create unique color based on user and upload info
    const hash = this.simpleHash(userId + uploadId);
    const r = (hash >> 16) & 255;
    const g = (hash >> 8) & 255;
    const b = hash & 255;

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 1, 1);

    return canvas.toDataURL();
  }

  addSecurityPattern(canvas, userId) {
    if (!canvas || !userId) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.save();
      ctx.globalAlpha = 0.02;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.5;

      // Create a unique pattern based on user ID
      const hash = this.simpleHash(userId);
      const pattern = [];

      for (let i = 0; i < 20; i++) {
        const x = (hash * (i + 1) * 7) % canvas.width;
        const y = (hash * (i + 1) * 13) % canvas.height;
        const endX = (x + hash * (i + 1)) % canvas.width;
        const endY = (y + hash * (i + 1)) % canvas.height;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      ctx.restore();
      console.log('Security pattern added');
    } catch (error) {
      console.error('Error adding security pattern:', error);
    }
  }

  // Helper methods
  stringToBinary(str) {
    return str.split('').map(char => 
      char.charCodeAt(0).toString(2).padStart(8, '0')
    ).join('');
  }

  binaryToString(binary) {
    try {
      // Split binary into 8-bit chunks
      const bytes = binary.match(/.{1,8}/g) || [];
      return bytes.map(byte => 
        String.fromCharCode(parseInt(byte, 2))
      ).join('');
    } catch (error) {
      console.error('Error converting binary to string:', error);
      return '';
    }
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Public method to watermark an image before upload
  async watermarkImage(file, userId, metadata = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        try {
          // Set canvas size to match image
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw the image
          ctx.drawImage(img, 0, 0);

          // Add multiple layers of watermarking
          this.embedWatermark(canvas, userId);
          this.embedInvisibleText(canvas, userId);
          this.addSecurityPattern(canvas, userId);

          // Add metadata if provided
          if (Object.keys(metadata).length > 0) {
            this.embedMetadata(canvas, {
              ...metadata,
              userId,
              timestamp: new Date().toISOString()
            });
          }

          // Convert back to blob
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: file.type }));
          }, file.type);

        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // Method to show watermark warning
  showWatermarkWarning() {
    const warningElement = document.getElementById('watermarkWarning');
    if (warningElement) {
      warningElement.style.display = 'block';
      warningElement.classList.add('pulse');
      
      setTimeout(() => {
        warningElement.classList.remove('pulse');
      }, 3000);
    }
  }
}

// Initialize watermark system
document.addEventListener('DOMContentLoaded', () => {
  window.watermarkManager = new WatermarkManager();
});

// Export the main function for use in other modules
export function embedWatermark(canvas, userId) {
  if (window.watermarkManager) {
    window.watermarkManager.embedWatermark(canvas, userId);
  }
}

export default WatermarkManager;
