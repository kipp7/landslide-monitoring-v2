#ifndef TESTS_MOCKS_IOT_I2C_H
#define TESTS_MOCKS_IOT_I2C_H

enum EnumI2cFre {
    EI2C_FRE_100K = 0,
    EI2C_FRE_400K,
    EI2C_FRE_1000K,
};

enum EnumI2cId {
    EI2C0_M2 = 0,
    EI2C1_M2,
    EI2C0_M0,
    EI2C1_M0,
    EI2C1_M1,
    EI2C0_M1,
    EI2C2_M0,
};

unsigned int IoTI2cInit(unsigned int id, unsigned int baudrate);
unsigned int IoTI2cDeinit(unsigned int id);
unsigned int IoTI2cWrite(
    unsigned int id,
    unsigned short device_addr,
    const unsigned char *data,
    unsigned int data_len);
unsigned int IoTI2cRead(
    unsigned int id,
    unsigned short device_addr,
    unsigned char *data,
    unsigned int data_len);
unsigned int IoTI2cSetBaudrate(unsigned int id, unsigned int baudrate);
unsigned int IoTI2cScan(unsigned int id, unsigned short *slave_addr, unsigned int slave_addr_len);

#endif
