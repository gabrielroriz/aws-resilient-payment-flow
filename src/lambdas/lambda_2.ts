export const handler = async (
    event: any
): Promise<any> => {
    const message = "Hello World from Lambda 2!";
    console.log(`Returning ${message}`);
    return {
        statusCode: 200,
        body: JSON.stringify(message)
    }
}
