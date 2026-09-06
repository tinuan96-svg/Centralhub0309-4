/**
 * Zebra Direct Print Service
 * Communicates with Zebra BrowserPrint local API (localhost:9100/9101)
 * Optimized for Zebra ZD421D Label Printer
 */
export class ZebraPrintService {
  private static LOCAL_API_URL = 'http://localhost:9101/browserprint';

  /**
   * Checks if Zebra BrowserPrint is running and finds the ZD421 printer
   */
  static async getPrinter(): Promise<any> {
    try {
      const response = await fetch(`${this.LOCAL_API_URL}/devices/default?type=printer`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.warn('[Zebra] BrowserPrint not detected on localhost:9101');
      return null;
    }
  }

  /**
   * Prints raw ZPL data directly to the printer
   */
  static async printZPL(zpl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const printer = await this.getPrinter();
      if (!printer) {
        return { success: false, error: 'Zebra BrowserPrint not detected. Ensure Zebra software is running.' };
      }

      const response = await fetch(`${this.LOCAL_API_URL}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: printer,
          data: zpl
        })
      });

      if (!response.ok) throw new Error('Failed to send data to Zebra printer');

      return { success: true };
    } catch (err: any) {
      console.error('[Zebra] Print Error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generates ZPL for a standard shipping label
   * Based on Zebra ZD421D 4x6 inch format
   */
  static generateLabelZPL(data: {
    orderNumber: string;
    customerName: string;
    address: string;
    trackingNumber: string;
    weight: string;
    carrier: string;
  }) {
    // Basic ZPL template for 4x6 labels
    return `
^XA
^FX Header
^CF0,60
^FO50,50^GB700,1,3^FS
^FO50,80^FD${data.carrier.toUpperCase()} SHIPMENT^FS
^FO50,150^GB700,1,3^FS

^FX Recipient Info
^CF0,35
^FO50,200^FDShip To:^FS
^CF0,45
^FO50,260^FD${data.customerName}^FS
^FO50,320^FB700,3,0,L^FD${data.address}^FS

^FX Barcode Section
^BY4,2,200
^FO100,550^BCN,200,Y,N,N^FD${data.trackingNumber}^FS

^FX Order Reference
^CF0,30
^FO50,850^FDOrder: ${data.orderNumber}^FS
^FO50,890^FDWeight: ${data.weight} KG^FS
^FO50,930^FDThank You for Order and See you again.^FS

^FX Footer
^FO50,970^GB700,1,3^FS
^XZ
`;
  }
}
