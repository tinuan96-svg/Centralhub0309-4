/**
 * Improvement #4: Direct ZPL Generation Utility
 * Generates raw ZPL code for thermal printers to speed up the packing station.
 */
export const generateZPL = (data: {
  orderNumber: string;
  customerName: string;
  address: string;
  trackingNumber: string;
  weight: string;
}) => {
  return `
^XA
^FX Top section with Order Info
^CF0,60
^FO50,50^GB100,100,100^FS
^FO170,80^FDORDER: ${data.orderNumber}^FS
^CF0,30
^FO50,180^FDSHIP TO:^FS
^FO50,220^FD${data.customerName}^FS
^FO50,260^FB500,2,0,L^FD${data.address}^FS

^FX Barcode section
^BY5,2,270
^FO100,450^BCN,270,Y,N,N^FD${data.trackingNumber}^FS

^FX Stats
^CF0,30
^FO50,850^FDWEIGHT: ${data.weight} KG^FS
^FO50,900^FDCentralHub Fulfillment^FS
^XZ
`;
};
